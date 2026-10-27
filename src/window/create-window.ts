import { applyBackdrop, Backdrop } from "./backdrop.ts";
import type { Mounted } from "#src/renderer/host/mount.svelte.js";
import { mountControl } from "#src/renderer/host/mount.svelte.js";
import { Grid, Window } from "#src/winui.js";
import type { FrameworkElement } from "#src/winui.js";
import type { Component } from "svelte";

interface WindowChrome {
  title?: string;

  /** In device pixels. */
  size?: {
    width: number;
    height: number;
  };
  backdrop?: Backdrop;
  extendsIntoTitleBar?: boolean;

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

const CHROME_DEFAULTS = {
  backdrop: Backdrop.none,
  extendsIntoTitleBar: false,
  title: ""
};

function applyChrome({ window, chrome }: {
  window: Window;
  chrome: WindowChrome;
}) {
  const { backdrop, extendsIntoTitleBar: isExtended, title } = {
    ...CHROME_DEFAULTS,
    ...chrome
  };
  applyBackdrop({
    window,
    backdrop
  });
  window.extendsContentIntoTitleBar = isExtended;
  window.title = title;

  const { size } = chrome;
  const hasSize = size !== undefined;
  if (hasSize) {
    window.appWindow.resize(size);
  }
}

// Puts the content in the window; the mounted component, if it is one.
function placeContent<Props extends object>({ window, options }: {
  window: Window;
  options: WindowOptions<Props>;
}) {
  if (!isComponentContent(options)) {
    window.content = options.control;
    return null;
  }

  const mounted = mountControl(options.component, options.props);
  // The component's root sits in a grid of the window's, which puts a new root
  // (a hot update's) in the old one's place: a window's own content is not a
  // place a swap can find the old root's parent in.
  const holder = new Grid();
  holder.children.append(mounted.root);
  window.content = holder;
  mounted.onRootChange(root => {
    holder.children.clear();
    holder.children.append(root);
  });
  return mounted;
}

/**
 * Opens a window around a component or a control. Call it on the UI thread,
 * from `onStart` (application.ts) or later.
 */
export function createWindow<Props extends object>(options: WindowOptions<Props>) {
  const window = new Window();
  applyChrome({
    window,
    chrome: options
  });
  const mounted = placeContent({
    window,
    options
  });
  const isBackground = options.isBackground === true;
  if (isBackground) {
    window.appWindow.showWithActivation(false);
  } else {
    window.activate();
  }

  const appWindow: AppWindow<Props> = {
    window,
    mounted,
    close() {
      window.close();
    },
    onClosed(listener) {
      window.onClosed(listener);
    }
  };
  return appWindow;
}
