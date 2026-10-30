import type { Accept } from "./accept.ts";
import { FormatType } from "./data-transfer.ts";
import type { EffectAllowed } from "./drag-effects.ts";
import type { DragEvent, DragEventHandler } from "./drag-event.ts";
import { addDragHandler, DragSourceEventType } from "./drag-source.ts";
import type { DragControl } from "./drag-source.ts";
import { addDropHandler, addDropzone, DropEventType } from "./drop-target.ts";
import type { DropControl, Dropzone } from "./drop-target.ts";
import type { NativeFile } from "./native-file.ts";
import { control } from "#src/renderer/host/control.js";
import { read, write } from "#src/renderer/host/reflect.js";
import { SolidColorBrush } from "#src/winui.js";

/** What `dropzone` takes: a drop zone's filters and the web's drop events. */
export interface DropzoneOptions extends Omit<Dropzone, "accept"> {
  /** What to accept, like `<input accept>`: `".png,image/*"`, `["directory"]`. Everything when left out. */
  accept?: Accept;
  onDragEnter?: DragEventHandler;
  onDragOver?: DragEventHandler;
  onDragLeave?: DragEventHandler;
  /** Hears the drop; `event.dataTransfer.files` are the files and folders that passed `accept`. */
  onDrop?: DragEventHandler;
}

const DROP_HANDLERS = [
  ["onDragEnter", DropEventType.dragenter],
  ["onDragOver", DropEventType.dragover],
  ["onDragLeave", DropEventType.dragleave],
  ["onDrop", DropEventType.drop]
] as const;

// A control with no background is not hit by the pointer, so a drag never reaches it.
function makeHitTestable(target: object) {
  const hasNoBackground = read(target, "background") === null;
  if (!hasNoBackground) {
    return () => undefined;
  }

  write(
    target, "background", new SolidColorBrush({
      a: 0,
      r: 0,
      g: 0,
      b: 0
    })
  );
  return () => write(target, "background", null);
}

/**
 * Makes an element take drops, with `dropzone({ accept: ".png", onDrop })`
 * after `@attach` on the element. It sets AllowDrop, gives an element with no background a
 * transparent one (so the area is hit), answers the drag with the copy cursor
 * for what `accept` allows and the forbidden sign for the rest, and reads the
 * dropped files and text. On the root element of the window it takes drops
 * anywhere on the window.
 *
 * @param options - The filter and the handlers.
 * @returns The attachment to put after `@attach`.
 */
export function dropzone(options: DropzoneOptions = {}) {
  return control<DropControl>(target => {
    const restore = makeHitTestable(target);
    const stops = [
      addDropzone({
        control: target,
        zone: options
      })
    ];
    for (const [name, type] of DROP_HANDLERS) {
      const handler = options[name];
      if (handler) {
        stops.push(
          addDropHandler({
            control: target,
            type,
            handler
          })
        );
      }
    }

    return () => {
      for (const stop of stops) {
        stop();
      }

      restore();
    };
  });
}

/** What `draggable` takes: the data to drag and the web's source events. */
export interface DraggableOptions {
  text?: string;
  html?: string;
  uri?: string;
  /** Files and folders; make them with `nativeFileAt`. */
  files?: readonly NativeFile[];
  /** A picture to drag. */
  bitmap?: NativeFile;
  /** What the target may do with it; default all. */
  effectAllowed?: EffectAllowed;
  /** Runs after the options are applied; may change `event.dataTransfer`, and `preventDefault()` cancels. */
  onDragStart?: DragEventHandler;
  /** Repeats about every 50 milliseconds while the drag runs. */
  onDrag?: DragEventHandler;
  /** The drag ended; `event.dataTransfer.dropEffect` is what the target did, `none` when cancelled. */
  onDragEnd?: DragEventHandler;
}

function fillStatic({ options, event }: {
  options: DraggableOptions;
  event: DragEvent;
}) {
  const { dataTransfer } = event;
  const values = [
    [FormatType.text, options.text],
    [FormatType.html, options.html],
    [FormatType.uri, options.uri]
  ] as const;
  for (const [type, value] of values) {
    const hasValue = value !== undefined;
    if (hasValue) {
      dataTransfer.setData(type, value);
    }
  }

  for (const file of options.files ?? []) {
    dataTransfer.addFile(file);
  }

  dataTransfer.bitmap = options.bitmap ?? dataTransfer.bitmap;
  dataTransfer.effectAllowed = options.effectAllowed ?? dataTransfer.effectAllowed;
}

/**
 * Makes an element draggable out of the window, to other apps and to Explorer:
 * `draggable({ text: "hello" })` after `@attach` on the element. It sets CanDrag and
 * builds the data package from the options (or from `event.dataTransfer` in
 * `onDragStart`).
 *
 * @param options - The data and the handlers.
 * @returns The attachment to put after `@attach`.
 */
export function draggable(options: DraggableOptions) {
  return control<DragControl>(target => {
    const stops = [
      addDragHandler({
        control: target,
        type: DragSourceEventType.dragstart,
        async handler(event) {
          fillStatic({
            options,
            event
          });
          await options.onDragStart?.(event);
        }
      })
    ];
    const handlers = [
      [options.onDrag, DragSourceEventType.drag],
      [options.onDragEnd, DragSourceEventType.dragend]
    ] as const;
    for (const [handler, type] of handlers) {
      if (handler) {
        stops.push(
          addDragHandler({
            control: target,
            type,
            handler
          })
        );
      }
    }

    return () => {
      for (const stop of stops) {
        stop();
      }
    };
  });
}
