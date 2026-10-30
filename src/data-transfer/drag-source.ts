import { DataTransfer } from "./data-transfer.ts";
import { allowedOperationsOf, effectOf } from "./drag-effects.ts";
import { DragEvent } from "./drag-event.ts";
import type { DragEventHandler, Position } from "./drag-event.ts";
import { fillPackage } from "./package-io.ts";
import { targetOf } from "./winrt-package.ts";
import { createCursorReader } from "#src/tray/native.js";
import { startTimer } from "#src/window/timers.js";
import type { DataPackage } from "#winui/windows/application-model/data-transfer/DataPackage";

/** The drag events of a source, as the web names them. */
export const DragSourceEventType = {
  dragstart: "dragstart",
  drag: "drag",
  dragend: "dragend"
} as const;

/** One of `DragSourceEventType`'s values. */
export type DragSourceEventType = (typeof DragSourceEventType)[keyof typeof DragSourceEventType];

/** The part of WinUI's `DragStartingEventArgs` the source uses. */
export interface DragStartArgs {
  cancel: boolean;
  allowedOperations: number;
  readonly data: DataPackage;
  getDeferral(): {
    complete(): void;
  };
}

/** The part of WinUI's `DropCompletedEventArgs` the source uses. */
export interface DragEndArgs {
  readonly dropResult: number;
}

/** The part of a WinUI control a drag source needs. */
export interface DragControl {
  canDrag: boolean;
  readonly xamlRoot?: {
    readonly content: object | null;
    readonly coordinateConverter?: {
      convertScreenToLocal(point: Position): Position;
    };
  } | null;
  onDragStarting(callback: (sender: unknown, args: unknown) => void): () => void;
  onDropCompleted(callback: (sender: unknown, args: unknown) => void): () => void;
}

/** How a source reads the cursor and ticks; the defaults are the real ones, tests pass fakes. */
export interface DragClock {
  /** Calls `onTick` about every 50 milliseconds until the returned function is called. */
  every(onTick: () => void): () => void;

  /** The cursor in screen pixels. */
  cursor(): Position;
}

const TICK_MILLISECONDS = 50;
const ORIGIN: Position = {
  x: 0,
  y: 0
};

function realClock() {
  return {
    every: onTick => startTimer({
      milliseconds: TICK_MILLISECONDS,
      onTick
    }),
    cursor: createCursorReader()
  } satisfies DragClock;
}

function isStartArgs(value: unknown): value is DragStartArgs {
  return typeof value === "object" && value !== null && "allowedOperations" in value && "getDeferral" in value;
}

function isEndArgs(value: unknown): value is DragEndArgs {
  return typeof value === "object" && value !== null && "dropResult" in value;
}

function reportError(error: unknown) {
  queueMicrotask(() => {
    throw error;
  });
}

class DragBinding {
  readonly handlers: Record<DragSourceEventType, Set<DragEventHandler>> = {
    dragstart: new Set(),
    drag: new Set(),
    dragend: new Set()
  };
  private transfer: DataTransfer | undefined;
  private stopTicking: (() => void) | undefined;
  private readonly control: DragControl;
  private readonly clock: () => DragClock;
  private readonly stops: Array<() => void>;
  private readonly onEmpty: () => void;

  constructor({ control, clock, onEmpty }: {
    control: DragControl;
    clock: () => DragClock;
    onEmpty: () => void;
  }) {
    this.control = control;
    this.clock = clock;
    this.onEmpty = onEmpty;
    control.canDrag = true;
    this.stops = [
      control.onDragStarting((_sender, args) => {
        this.onStart(args).catch(reportError);
      }),
      control.onDropCompleted((_sender, args) => this.onEnd(args))
    ];
  }

  get isEmpty() {
    return !Object.values(this.handlers).some(set => set.size > 0);
  }

  release() {
    this.stopTicking?.();
    for (const stop of this.stops) {
      stop();
    }

    this.control.canDrag = false;
  }

  notify() {
    if (this.isEmpty) {
      this.onEmpty();
    }
  }

  private makeEvent({ type, transfer, client }: {
    type: DragSourceEventType;
    transfer: DataTransfer;
    client: Position;
  }) {
    return new DragEvent({
      type,
      target: this.control,
      dataTransfer: transfer,
      client,
      offset: ORIGIN,
      modifiers: 0
    });
  }

  private async dispatch({ type, event }: {
    type: DragSourceEventType;
    event: DragEvent;
  }) {
    for (const handler of this.handlers[type]) {
      await handler(event);

      if (event.isStopped) {
        return;
      }
    }
  }

  private async onStart(args: unknown) {
    if (!isStartArgs(args)) {
      return;
    }

    const deferral = args.getDeferral();
    try {
      const transfer = new DataTransfer();
      this.transfer = transfer;
      const event = this.makeEvent({
        type: DragSourceEventType.dragstart,
        transfer,
        client: ORIGIN
      });
      await this.dispatch({
        type: DragSourceEventType.dragstart,
        event
      });

      if (event.defaultPrevented) {
        args.cancel = true;
        return;
      }

      args.allowedOperations = allowedOperationsOf(transfer.effectAllowed);
      await fillPackage({
        transfer,
        target: targetOf(args.data)
      });
      this.startTicking(transfer);
    } finally {
      deferral.complete();
    }
  }

  private startTicking(transfer: DataTransfer) {
    const hasDragHandlers = this.handlers.drag.size > 0;
    if (!hasDragHandlers) {
      return;
    }

    const clock = this.clock();
    const converter = this.control.xamlRoot?.coordinateConverter;
    this.stopTicking = clock.every(() => {
      const screen = clock.cursor();
      this.dispatch({
        type: DragSourceEventType.drag,
        event: this.makeEvent({
          type: DragSourceEventType.drag,
          transfer,
          client: converter ? converter.convertScreenToLocal(screen) : screen
        })
      }).catch(reportError);
    });
  }

  private onEnd(args: unknown) {
    this.stopTicking?.();
    this.stopTicking = undefined;
    const { transfer } = this;
    const isEnded = transfer !== undefined && isEndArgs(args);
    if (!isEnded) {
      return;
    }

    transfer.dropEffect = effectOf(args.dropResult);
    this.transfer = undefined;
    this.dispatch({
      type: DragSourceEventType.dragend,
      event: this.makeEvent({
        type: DragSourceEventType.dragend,
        transfer,
        client: ORIGIN
      })
    }).catch(reportError);
  }
}

const bindings = new WeakMap<DragControl, DragBinding>();

/**
 * Lets a handler hear one drag event of a source control, as `ondragstart`,
 * `ondrag` and `ondragend` do on the web; the control then can be dragged.
 * `dragstart` fills `event.dataTransfer`, and `preventDefault()` there
 * cancels the drag. `drag` repeats about every 50 milliseconds while the drag
 * runs, with the cursor's position (WinUI has no such event: a timer on the
 * UI thread reads the cursor, which only reads). `dragend` has the
 * `dropEffect` the target did, `none` when the drop did not happen.
 *
 * @param options - The control, the event and the handler; `clock` replaces the real timer and cursor (tests).
 * @returns What removes the handler (the control stops being draggable with the last one).
 */
export function addDragHandler({ control, type, handler, clock = realClock }: {
  control: DragControl;
  type: DragSourceEventType;
  handler: DragEventHandler;
  clock?: () => DragClock;
}) {
  const existing = bindings.get(control);
  const binding = existing ?? new DragBinding({
    control,
    clock,
    onEmpty() {
      bindings.get(control)?.release();
      bindings.delete(control);
    }
  });
  bindings.set(control, binding);
  binding.handlers[type].add(handler);
  return () => {
    binding.handlers[type].delete(handler);
    binding.notify();
  };
}
