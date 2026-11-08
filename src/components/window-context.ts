import type { WindowHandle } from "#src/window/window-handle.js";
import { getContext, setContext } from "svelte";

const WINDOW_KEY = Symbol("window-handle");

/**
 * Tells the components below a `Window` which window they sit in; call it while the `Window` is made.
 *
 * @param read - Reads the window handle, which exists once the window has opened.
 */
export function provideWindowHandle(read: () => WindowHandle | undefined) {
  setContext(WINDOW_KEY, read);
}

/**
 * The window the component being made sits in.
 *
 * @returns Reads its handle: undefined outside a `Window`, or before it has opened.
 */
export function inheritedWindowHandle() {
  const read = getContext<(() => WindowHandle | undefined) | undefined>(WINDOW_KEY);
  return () => read?.();
}
