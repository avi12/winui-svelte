import { control } from "winui-svelte";

// What the interaction example's components leave for its report to read: the
// native control behind each id the window shows (the same id a test finds the
// control by through UI Automation), and a log of what the components did.

const handles = new Map<string, object>();
const events: string[] = [];

/** The attachment that records a control under `id` for as long as its element lives. */
export function keep(id: string) {
  return control((native: object) => {
    handles.set(id, native);
    return () => {
      handles.delete(id);
    };
  });
}

/** Adds a line to the log the report carries. */
export function note(line: string) {
  events.push(line);
}

/** The lines noted so far, oldest first. */
export function noted() {
  return [...events];
}

/** The native control kept under `id`, or `undefined` when its element is gone. */
export function handleOf(id: string) {
  return handles.get(id);
}

/** The ids kept now. */
export function handleIds() {
  return [...handles.keys()];
}
