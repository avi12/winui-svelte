import type { DragEventHandler } from "./drag-event.ts";
import { addDragHandler, DragSourceEventType } from "./drag-source.ts";
import { addDropHandler, DropEventType } from "./drop-target.ts";
import type { NativeValue } from "#src/native-value.js";
import type { EventAdapter } from "#src/renderer/host/event-adapters.js";
import { eventAdapters } from "#src/renderer/host/event-adapters.js";

function isDragEventHandler(value: NativeValue): value is DragEventHandler {
  return typeof value === "function";
}

function adapterOf(add: (options: Parameters<EventAdapter["subscribe"]>[0] & {
  handler: DragEventHandler;
}) => () => void) {
  return {
    subscribe({ control, handler }) {
      if (!isDragEventHandler(handler)) {
        return () => undefined;
      }

      return add({
        control,
        handler
      });
    }
  } satisfies EventAdapter;
}

/**
 * Makes the web's drag event names work on elements: `ondragstart`, `ondrag`
 * and `ondragend` on a source, `ondragenter`, `ondragover`, `ondragleave` and
 * `ondrop` on a target, written as in HTML, for example
 * `<border ondrop={event => ...}>`. The handler gets a `DragEvent` with a
 * `dataTransfer`. Call it once at start-up, before the first window. WinUI
 * events of the same name on a component (`onDrop`) are not touched.
 */
export function enableDragEvents() {
  for (const type of Object.values(DropEventType)) {
    eventAdapters.set(
      type, adapterOf(({ control, handler }) => addDropHandler({
        control,
        type,
        handler
      }))
    );
  }

  for (const type of Object.values(DragSourceEventType)) {
    eventAdapters.set(
      type, adapterOf(({ control, handler }) => addDragHandler({
        control,
        type,
        handler
      }))
    );
  }
}
