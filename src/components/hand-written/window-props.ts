// The Window component's props. Kept out of Window.d.svelte.ts so the
// component can import them: the Svelte language server reads
// `./Window.d.svelte.ts` imported from Window.svelte as Window.svelte itself.
import type { WindowHandle } from "#src/window/window-handle.js";
import type { WindowProps } from "#src/window/window-host.svelte.js";
import type { Snippet } from "svelte";

/** The props of the `Window` component: the window's own, a handle, a title bar and its content. */
export interface WindowComponentProps extends WindowProps {
  // The open window, for code that closes it, restores it or brings it to the
  // front: `bind:handle`.
  handle?: WindowHandle | undefined;
  // The custom title bar: the window's drag region (clicks on controls inside
  // it still reach them). Shown above the content, which then runs under it.
  titleBar?: Snippet;
  children?: Snippet;
}
