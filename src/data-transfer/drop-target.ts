import type { Accept } from "./accept.ts";
import { DataKind, isFileAccepted, isKindAccepted } from "./accept.ts";
import { DataTransfer } from "./data-transfer.ts";
import type { DropEffect } from "./drag-effects.ts";
import { allowedOperationsOf, effectAllowedOf, effectOf, operationOf } from "./drag-effects.ts";
import type { DragFeedback, Position } from "./drag-event.ts";
import { DragEvent } from "./drag-event.ts";
import type { DragEventHandler } from "./drag-event.ts";
import type { PackageSource } from "./package-io.ts";
import { previewOf, snapshotOf } from "./package-io.ts";
import { dataPackageOf, sourceOf } from "./winrt-package.ts";
import type { DataPackageView } from "#winui/windows/application-model/data-transfer/DataPackageView";

/** The drop events of the web. */
export const DropEventType = {
  dragenter: "dragenter",
  dragover: "dragover",
  dragleave: "dragleave",
  drop: "drop"
} as const;

/** One of `DropEventType`'s values. */
export type DropEventType = (typeof DropEventType)[keyof typeof DropEventType];

/** The part of WinUI's `DragEventArgs` the target uses. */
export interface DropArgs {
  acceptedOperation: number;
  readonly allowedOperations: number;
  readonly dataView: DataPackageView;
  readonly modifiers: number;
  readonly dragUIOverride: DragFeedback;
  handled: boolean;
  getPosition(relativeTo: object): Position;
  getDeferral(): {
    complete(): void;
  };
}

/** The part of a WinUI control a drop target needs. */
export interface DropControl {
  allowDrop: boolean;
  readonly xamlRoot?: {
    readonly content: object | null;
  } | null;
  onDragEnter(callback: (sender: unknown, args: unknown) => void): () => void;
  onDragOver(callback: (sender: unknown, args: unknown) => void): () => void;
  onDragLeave(callback: (sender: unknown, args: unknown) => void): () => void;
  onDrop(callback: (sender: unknown, args: unknown) => void): () => void;
}

/** What a drop zone is told to accept and to tell. */
export interface Dropzone {
  /** Which drags are accepted; the cursor shows the forbidden sign for the others. */
  accept?: Accept;

  /** Accept one file at most; the others are passed to `onReject`. Default false. */
  isSingle?: boolean;

  /** Custom format ids to read as text on the drop (they come in `dataTransfer.getData`). */
  formats?: readonly string[];

  /** Told when a drag enters (true) or leaves or drops (false): the hook for a highlight. */
  onDragStateChange?: (isOver: boolean) => void;

  /** Told the files and folders `accept` and `isSingle` left out. */
  onReject?: (event: DragEvent) => void;

  /** Reads the source of a drop; for tests with fakes. Default: the real package view. */
  sourceOf?: (view: DataPackageView) => PackageSource;
}

interface Handlers {
  dragenter: Set<DragEventHandler>;
  dragover: Set<DragEventHandler>;
  dragleave: Set<DragEventHandler>;
  drop: Set<DragEventHandler>;
}

const ALL_KINDS = Object.values(DataKind);
const ALL_OPERATIONS = allowedOperationsOf("all");

function isDropArgs(value: unknown): value is DropArgs {
  return typeof value === "object" && value !== null && "dataView" in value && "getDeferral" in value;
}

function reportError(error: unknown) {
  queueMicrotask(() => {
    throw error;
  });
}

function pointRelativeTo({ args, target }: {
  args: DropArgs;
  target: object;
}) {
  const { x, y } = args.getPosition(target);
  return {
    x,
    y
  };
}

class DropBinding {
  readonly handlers: Handlers = {
    dragenter: new Set(),
    dragover: new Set(),
    dragleave: new Set(),
    drop: new Set()
  };
  readonly zones = new Set<Dropzone>();
  private lastEffect: DropEffect = "none";
  private isOver = false;
  private readonly control: DropControl;
  private readonly stops: Array<() => void>;
  private readonly onEmpty: () => void;

  constructor({ control, onEmpty }: {
    control: DropControl;
    onEmpty: () => void;
  }) {
    this.control = control;
    this.onEmpty = onEmpty;
    control.allowDrop = true;
    this.stops = [
      control.onDragEnter((_sender, args) => this.onOver({
        args,
        type: DropEventType.dragenter
      })),
      control.onDragOver((_sender, args) => this.onOver({
        args,
        type: DropEventType.dragover
      })),
      control.onDragLeave((_sender, args) => this.onLeave(args)),
      control.onDrop((_sender, args) => {
        this.drop(args).catch(reportError);
      })
    ];
  }

  get isEmpty() {
    const hasHandlers = Object.values(this.handlers).some(set => set.size > 0);
    return !hasHandlers && this.zones.size === 0;
  }

  release() {
    for (const stop of this.stops) {
      stop();
    }

    this.control.allowDrop = false;
  }

  notify() {
    if (this.isEmpty) {
      this.onEmpty();
    }
  }

  private setOver(isOver: boolean) {
    const isChanged = this.isOver !== isOver;
    if (!isChanged) {
      return;
    }

    this.isOver = isOver;
    for (const zone of this.zones) {
      zone.onDragStateChange?.(isOver);
    }
  }

  private makeEvent({ type, args, transfer }: {
    type: DropEventType;
    args: DropArgs;
    transfer: DataTransfer;
  }) {
    const root = this.control.xamlRoot?.content ?? this.control;
    return new DragEvent({
      type,
      target: this.control,
      dataTransfer: transfer,
      client: pointRelativeTo({
        args,
        target: root
      }),
      offset: pointRelativeTo({
        args,
        target: this.control
      }),
      modifiers: args.modifiers,
      feedback: args.dragUIOverride
    });
  }

  private sourceFor(view: DataPackageView) {
    for (const zone of this.zones) {
      if (zone.sourceOf) {
        return zone.sourceOf(view);
      }
    }

    return sourceOf(view);
  }

  // The kinds the data holds are all a drag can be judged by; the files' names come with the drop.
  private isDragAccepted(source: PackageSource) {
    const kinds = ALL_KINDS.filter(kind => source.has(kind));
    const hasData = kinds.length > 0 || source.formats().length > 0;
    if (!hasData) {
      return false;
    }

    const hasZones = this.zones.size > 0;
    if (!hasZones) {
      return true;
    }

    return [...this.zones].some(zone => kinds.some(kind => isKindAccepted({
      accept: zone.accept,
      kind
    })));
  }

  over(args: unknown) {
    this.onOver({
      args,
      type: DropEventType.dragover
    });
  }

  private onOver({ args, type }: {
    args: unknown;
    type: DropEventType;
  }) {
    if (!isDropArgs(args)) {
      return;
    }

    const source = this.sourceFor(args.dataView);
    const transfer = previewOf(source);
    transfer.effectAllowed = effectAllowedOf(args.allowedOperations);
    transfer.dropEffect = effectOf(args.allowedOperations);
    const event = this.makeEvent({
      type,
      args,
      transfer
    });
    const isEntering = type === DropEventType.dragenter;
    if (isEntering) {
      this.setOver(true);
    }

    void this.dispatch({
      type,
      event
    });
    const hasExplicitHandler = this.handlers.dragenter.size + this.handlers.dragover.size > 0;
    const hasZones = this.zones.size > 0;
    const isAcceptedByPage = event.defaultPrevented || !hasExplicitHandler || hasZones;
    const isAccepted = this.isDragAccepted(source) && isAcceptedByPage;
    this.lastEffect = transfer.dropEffect;
    args.acceptedOperation = isAccepted ? operationOf(this.lastEffect) : 0;
    args.handled = isAccepted;
  }

  private onLeave(args: unknown) {
    this.setOver(false);

    if (!isDropArgs(args)) {
      return;
    }

    const transfer = previewOf(this.sourceFor(args.dataView));
    void this.dispatch({
      type: DropEventType.dragleave,
      event: this.makeEvent({
        type: DropEventType.dragleave,
        args,
        transfer
      })
    });
  }

  async drop(args: unknown) {
    this.setOver(false);

    if (!isDropArgs(args)) {
      return;
    }

    const deferral = args.getDeferral();
    try {
      const source = this.sourceFor(args.dataView);
      const customFormats = [...this.zones].flatMap(zone => zone.formats ?? []);
      const snapshot = await snapshotOf({
        source,
        customFormats
      });
      const { files, rejected } = this.filter(snapshot.files);
      const transfer = new DataTransfer({
        ...snapshot,
        files
      });
      transfer.effectAllowed = effectAllowedOf(args.allowedOperations);
      transfer.dropEffect = this.lastEffect;
      const event = this.makeEvent({
        type: DropEventType.drop,
        args,
        transfer
      });
      await this.dispatch({
        type: DropEventType.drop,
        event
      });
      this.reject({
        rejected,
        args,
        transfer
      });
      args.acceptedOperation = operationOf(transfer.dropEffect);
      args.handled = true;
    } finally {
      deferral.complete();
    }
  }

  private filter(dropped: ReadonlyArray<DataTransfer["files"][number]>) {
    const hasZones = this.zones.size > 0;
    if (!hasZones) {
      return {
        files: dropped,
        rejected: []
      };
    }

    const zones = [...this.zones];
    const passing = dropped.filter(file => zones.some(zone => isFileAccepted({
      accept: zone.accept,
      file
    })));
    const isSingle = zones.every(zone => zone.isSingle);
    const files = isSingle ? passing.slice(0, 1) : passing;
    return {
      files,
      rejected: dropped.filter(file => !files.includes(file))
    };
  }

  private reject({ rejected, args, transfer }: {
    rejected: ReadonlyArray<DataTransfer["files"][number]>;
    args: DropArgs;
    transfer: DataTransfer;
  }) {
    const hasRejected = rejected.length > 0;
    if (!hasRejected) {
      return;
    }

    const refused = new DataTransfer({
      strings: new Map(),
      files: rejected,
      types: transfer.types
    });
    const event = this.makeEvent({
      type: DropEventType.drop,
      args,
      transfer: refused
    });
    for (const zone of this.zones) {
      zone.onReject?.(event);
    }
  }

  private async dispatch({ type, event }: {
    type: DropEventType;
    event: DragEvent;
  }) {
    for (const handler of this.handlers[type]) {
      await handler(event);

      if (event.isStopped) {
        return;
      }
    }
  }
}

const bindings = new WeakMap<DropControl, DropBinding>();

function bindingOf(control: DropControl) {
  const existing = bindings.get(control);
  if (existing) {
    return existing;
  }

  const binding = new DropBinding({
    control,
    onEmpty() {
      binding.release();
      bindings.delete(control);
    }
  });
  bindings.set(control, binding);
  return binding;
}

/**
 * Lets a handler hear one drop event of a control, as `ondrop={...}` does on
 * the web; the control then takes drops. A drag is accepted when a
 * `dragenter` or `dragover` handler calls `event.preventDefault()`, or when
 * there is none of the two.
 *
 * @param options - The control, the event and the handler.
 * @returns What removes the handler (the control stops taking drops with the last one).
 */
export function addDropHandler({ control, type, handler }: {
  control: DropControl;
  type: DropEventType;
  handler: DragEventHandler;
}) {
  const binding = bindingOf(control);
  binding.handlers[type].add(handler);
  return () => {
    binding.handlers[type].delete(handler);
    binding.notify();
  };
}

/**
 * Makes a control a drop zone that accepts what `accept` says.
 *
 * @param options - The control and the zone.
 * @returns What removes the zone.
 */
export function addDropzone({ control, zone }: {
  control: DropControl;
  zone: Dropzone;
}) {
  const binding = bindingOf(control);
  binding.zones.add(zone);
  return () => {
    binding.zones.delete(zone);
    binding.notify();
  };
}

/**
 * Drops a data package on a control as if the user had, through the same
 * handlers a real drop reaches, with no input sent: for tests of an app.
 * Resolves when the drop has been read and every handler has run.
 *
 * @param options - A control that is a drop target, and what to drop.
 * @returns The operation the control accepted (`DataPackageOperation` flags; 0 when it refused).
 */
export async function simulateDrop({ control, transfer, allowedOperations = ALL_OPERATIONS }: {
  control: DropControl;
  transfer: DataTransfer;
  allowedOperations?: number;
}) {
  const binding = bindings.get(control);
  if (!binding) {
    throw new Error("the control takes no drops: give it a dropzone or an ondrop handler first");
  }

  const args: DropArgs = {
    acceptedOperation: 0,
    allowedOperations,
    dataView: (await dataPackageOf(transfer)).getView(),
    modifiers: 0,
    dragUIOverride: {
      caption: "",
      isCaptionVisible: false,
      isGlyphVisible: true,
      isContentVisible: true
    },
    handled: false,
    getPosition: () => ({
      x: 0,
      y: 0
    }),
    getDeferral: () => ({
      complete: () => undefined
    })
  };
  binding.over(args);
  await binding.drop(args);
  return args.acceptedOperation;
}
