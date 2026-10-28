import type { Backdrop } from "./backdrop.ts";
import { applyBackdrop, Backdrop as BackdropKind } from "./backdrop.ts";
import { joinAppUserModel } from "./native.ts";
import { WindowHandle } from "./window-handle.ts";
import type { FrameworkElement } from "#src/winui.js";
import { DisplayArea, DisplayAreaFallback, Window, WindowActivationState } from "#src/winui.js";

// What <Window> (components/hand-written/Window.svelte) does: a native window
// around the component's content, kept in line with its props.

/** The window's position and size, in device pixels, as AppWindow has them. */
export interface WindowBounds {
  x: number;
  y: number;
  width: number;
  height: number;
}

/**
 * Where the window opens, in device pixels; a size left out is the width or
 * height prop's.
 */
export interface WindowPlacement {
  x: number;
  y: number;
  width?: number;
  height?: number;
}

/** What a `<Window>` is told: its chrome, its size and limits, and what it reports back. */
export interface WindowProps {
  title?: string;

  /** The material behind the content; none (the default) is the theme's color. */
  backdrop?: Backdrop;

  /** The content runs up into the title bar. On by default with a `titleBar`. */
  extendsIntoTitleBar?: boolean;

  /** The path of an .ico file, for the title bar and the taskbar. */
  icon?: string;

  /**
   * Groups the process's windows on the taskbar (see `joinAppUserModel`). Read
   * once, before the window opens.
   */
  appUserModelId?: string;

  /**
   * The size in device-independent pixels (the scale of the window's display
   * applied); the window opens at it and follows it when it changes. Without
   * them the window has the system's default size.
   */
  width?: number;
  height?: number;

  /** The least the user can resize to, in device-independent pixels. */
  minWidth?: number;
  minHeight?: number;

  /** The most the user can resize to, in device-independent pixels. */
  maxWidth?: number;
  maxHeight?: number;
  isResizable?: boolean;
  isMaximizable?: boolean;
  isMinimizable?: boolean;

  /**
   * Where it opens; without it the window opens centered on its display
   * (`isCentered={false}` leaves it where the system puts it).
   */
  placement?: WindowPlacement | null;
  isCentered?: boolean;

  /**
   * false opens the window without taking focus from whatever the user is
   * doing (tests, captures, background starts). Read once.
   */
  activate?: boolean;

  /** The window became the active one (true) or lost that to another (false). */
  onActiveChanged?: (isActive: boolean) => void;
  onClosed?: () => void;

  /**
   * The bounds the window opens with, then whenever it is moved or resized, by
   * the user or by code; in device pixels.
   */
  onBoundsChanged?: (bounds: WindowBounds) => void;
}

function round({ value, scale }: {
  value: number;
  scale: number;
}) {
  return Math.round(value * scale);
}

// A prop the app left out is undefined; a guard names the test.
function isGiven<Value>(value: Value | undefined): value is Value {
  return value !== undefined;
}

class WindowHost {
  readonly handle: WindowHandle;
  private readonly props: WindowProps;
  private readonly titleBar: () => FrameworkElement | null;
  private readonly unsubscribe: Array<() => void> = [];
  private appliedBackdrop: Backdrop | null = null;
  private appliedSize: {
    width: number | undefined;
    height: number | undefined;
  };

  constructor(content: FrameworkElement, props: WindowProps, titleBar: () => FrameworkElement | null) {
    this.props = props;
    this.titleBar = titleBar;
    this.appliedSize = {
      width: props.width,
      height: props.height
    };

    const { appUserModelId } = props;
    if (isGiven(appUserModelId)) {
      joinAppUserModel(appUserModelId);
    }

    const window = new Window();
    this.handle = new WindowHandle(window);
    window.content = content;
    this.keepInLine(() => this.syncText());
    this.keepInLine(() => this.syncBackdrop());
    this.keepInLine(() => this.syncTitleBar());
    this.keepInLine(() => this.syncLimits());
    this.placeFirst();
    $effect(() => this.syncSize());
    this.listen();
    this.show();
  }

  dispose() {
    for (const unsubscribe of this.unsubscribe.splice(0)) {
      unsubscribe();
    }

    this.handle.close();
  }

  // Applied now, so the window opens as it is meant to, and again whenever
  // what `sync` reads changes.
  private keepInLine(sync: () => void) {
    sync();
    $effect(sync);
  }

  private syncText() {
    const { window } = this.handle;
    window.title = this.props.title ?? "";
    const { icon } = this.props;
    if (isGiven(icon)) {
      window.appWindow.setIcon(icon);
    }
  }

  private syncBackdrop() {
    const backdrop = this.props.backdrop ?? BackdropKind.none;
    const isApplied = backdrop === this.appliedBackdrop;
    if (!isApplied) {
      applyBackdrop({
        window: this.handle.window,
        backdrop
      });
      this.appliedBackdrop = backdrop;
    }
  }

  private syncTitleBar() {
    const bar = this.titleBar();
    const { window } = this.handle;
    const isExtended = this.props.extendsIntoTitleBar ?? bar !== null;
    window.extendsContentIntoTitleBar = isExtended;
    const isBarSet = isExtended && bar !== null;
    if (isBarSet) {
      window.setTitleBar(bar);
    }
  }

  private syncLimits() {
    const { isResizable, isMaximizable, isMinimizable, minWidth, minHeight, maxWidth, maxHeight } = this.props;
    const { presenter, scale } = this.handle;
    if (isGiven(isResizable)) {
      presenter.isResizable = isResizable;
    }

    if (isGiven(isMaximizable)) {
      presenter.isMaximizable = isMaximizable;
    }

    if (isGiven(isMinimizable)) {
      presenter.isMinimizable = isMinimizable;
    }

    if (isGiven(minWidth)) {
      presenter.preferredMinimumWidth = round({
        value: minWidth,
        scale
      });
    }

    if (isGiven(minHeight)) {
      presenter.preferredMinimumHeight = round({
        value: minHeight,
        scale
      });
    }

    if (isGiven(maxWidth)) {
      presenter.preferredMaximumWidth = round({
        value: maxWidth,
        scale
      });
    }

    if (isGiven(maxHeight)) {
      presenter.preferredMaximumHeight = round({
        value: maxHeight,
        scale
      });
    }
  }

  // The size and place it opens at: where it was (a dev swap puts the new
  // window where the old one was), else centered.
  private placeFirst() {
    const { props } = this;
    const { appWindow } = this.handle.window;
    const { scale } = this.handle;
    const size = {
      width: props.width === undefined ? appWindow.size.width : round({
        value: props.width,
        scale
      }),
      height: props.height === undefined ? appWindow.size.height : round({
        value: props.height,
        scale
      })
    };
    const placement = props.placement ?? null;
    const isPlaced = placement !== null;
    if (isPlaced) {
      appWindow.moveAndResize({
        x: placement.x,
        y: placement.y,
        width: placement.width ?? size.width,
        height: placement.height ?? size.height
      });
      return;
    }

    appWindow.resize(size);
    const isCentered = props.isCentered ?? true;
    if (isCentered) {
      this.center();
    }
  }

  private center() {
    const { appWindow } = this.handle.window;
    const display = DisplayArea.getFromWindowId(appWindow.id, DisplayAreaFallback.Nearest);
    const area = display.workArea;
    appWindow.move({
      x: area.x + Math.round((area.width - appWindow.size.width) / 2),
      y: area.y + Math.round((area.height - appWindow.size.height) / 2)
    });
  }

  // A new width or height resizes the window; the user's own resizing is not
  // undone, since the props did not change.
  private syncSize() {
    const { width, height } = this.props;
    const isChanged = width !== this.appliedSize.width || height !== this.appliedSize.height;
    if (!isChanged) {
      return;
    }

    this.appliedSize = {
      width,
      height
    };
    const { appWindow } = this.handle.window;
    const { scale } = this.handle;
    appWindow.resize({
      width: width === undefined ? appWindow.size.width : round({
        value: width,
        scale
      }),
      height: height === undefined ? appWindow.size.height : round({
        value: height,
        scale
      })
    });
  }

  private listen() {
    const { window } = this.handle;
    this.unsubscribe.push(
      window.onActivated((_sender, event) => {
        this.props.onActiveChanged?.(event.windowActivationState !== WindowActivationState.Deactivated);
      }),
      window.onClosed(() => this.props.onClosed?.()),
      window.appWindow.onChanged((_sender, event) => {
        const isMoved = event.didPositionChange || event.didSizeChange;
        if (isMoved) {
          this.reportBounds();
        }
      })
    );
  }

  private reportBounds() {
    const { position, size } = this.handle.appWindow;
    this.props.onBoundsChanged?.({
      x: position.x,
      y: position.y,
      width: size.width,
      height: size.height
    });
  }

  // Shown, and then the bounds it opened with are reported: an app that keeps
  // them (to reopen where the window was) needs them before the user moves it.
  private show() {
    const { window } = this.handle;
    const isBackground = this.props.activate === false;
    if (isBackground) {
      window.appWindow.showWithActivation(false);
    } else {
      window.activate();
    }

    this.reportBounds();
  }
}

/**
 * Opens the window around `content`; `titleBar` is read whenever it is needed
 * (it is state in the component, the element of its titleBar snippet).
 */
export function attachWindow({ content, props, titleBar }: {
  content: FrameworkElement;
  props: WindowProps;
  titleBar: () => FrameworkElement | null;
}) {
  const host = new WindowHost(content, props, titleBar);
  return {
    handle: host.handle,
    dispose: () => host.dispose()
  };
}
