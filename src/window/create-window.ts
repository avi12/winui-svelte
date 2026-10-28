import type { WindowProps, WindowSize } from "./window-host.svelte.ts";
import { attachStandaloneWindow } from "./window-host.svelte.ts";
import type { Mounted } from "#src/renderer/host/mount.svelte.js";
import { mountControl } from "#src/renderer/host/mount.svelte.js";
import { Grid } from "#src/winui.js";
import type { FrameworkElement, Window } from "#src/winui.js";
import type { Component } from "svelte";

interface WindowChrome extends Pick<WindowProps, "backdrop" | "extendsIntoTitleBar" | "isModal" | "owner" | "title"> {
  /** In device pixels. */
  size?: WindowSize;

  /**
   * Shown without taking focus from whatever the user is doing: for tests and
   * captures.
   */
  isBackground?: boolean;
}

interface ComponentContent<Props extends object> {
  /** Mounted, so its props can change and it can be unmounted. */
  component: Component<Props>;
  props: Props;
}

interface ControlContent {
  /** A control made elsewhere. */
  control: FrameworkElement;
}

/** What `createWindow` opens: the window's chrome, and a component or a control as its content. */
export type WindowOptions<Props extends object> = WindowChrome & (ComponentContent<Props> | ControlContent);

/** A window `createWindow` opened. */
export interface AppWindow<Props extends object> {
  /** The native WinUI window. */
  readonly window: Window;

  /** The mounted component; null when the content was a control. */
  readonly mounted: Mounted<Props> | null;

  /** Closes the window. */
  close(): void;

  /** Calls `listener` once the window has closed. */
  onClosed(listener: () => void): void;
}

type ComponentWindowOptions<Props extends object> = WindowChrome & ComponentContent<Props>;

function isComponentContent<Props extends object>(
  options: WindowOptions<Props>
): options is ComponentWindowOptions<Props> {
  return "component" in options;
}

// The element the window is made around, and the mounted component, if the
// content is one.
function contentOf<Props extends object>(options: WindowOptions<Props>) {
  if (!isComponentContent(options)) {
    return {
      content: options.control,
      mounted: null
    };
  }

  const mounted = mountControl({
    component: options.component,
    props: options.props
  });
  // The component's root sits in a grid of the window's, which puts a new root
  // (a hot update's) in the old one's place: a window's own content is not a
  // place a swap can find the old root's parent in.
  const holder = new Grid();
  holder.children.append(mounted.root);
  mounted.onRootChange(root => {
    holder.children.clear();
    holder.children.append(root);
  });
  return {
    content: holder,
    mounted
  };
}

/**
 * Opens a window around a component or a control. Call it on the UI thread,
 * from `onStart` (application.ts) or later.
 */
export function createWindow<Props extends object>(options: WindowOptions<Props>) {
  const { content, mounted } = contentOf(options);
  const { handle } = attachStandaloneWindow({
    content,
    props: {
      title: options.title,
      backdrop: options.backdrop,
      extendsIntoTitleBar: options.extendsIntoTitleBar,
      activate: options.isBackground !== true,
      isCentered: false,
      owner: options.owner,
      isModal: options.isModal
    },
    titleBar: () => null,
    size: options.size
  });
  const { window } = handle;
  const appWindow: AppWindow<Props> = {
    window,
    mounted,
    close() {
      handle.close();
    },
    onClosed(listener) {
      window.onClosed(listener);
    }
  };
  return appWindow;
}
