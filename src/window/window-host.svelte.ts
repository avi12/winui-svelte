import {
  applyCaptionButtonColors,
  applyPresentation,
  applyRegions,
  applyTheme,
  applyTitleBarHeight
} from "./apply-chrome.ts";
import type { Backdrop } from "./backdrop.ts";
import { applyBackdrop, Backdrop as BackdropKind } from "./backdrop.ts";
import type { CaptionButtonColors, CaptionButtonProperty, TitleBarHeight, WindowRegion } from "./chrome.ts";
import { TitleBarHeight as TitleBarHeightKind, WindowPresentation, WindowTheme } from "./chrome.ts";
import { joinAppUserModel, ownWindow } from "./native.ts";
import { createScaleTracker } from "./scale.ts";
import { WindowHandle } from "./window-handle.ts";
import type { FrameworkElement } from "#src/winui.js";
import {
  DisplayArea,
  DisplayAreaFallback,
  NonClientRegionKind,
  Window,
  WindowActivationState
} from "#src/winui.js";

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
  title?: string | undefined;

  /** The material behind the content; none (the default) is the theme's color. */
  backdrop?: Backdrop | undefined;

  /**
   * Light, dark, or the system's (the default): the theme of the content and
   * of the caption buttons.
   */
  theme?: WindowTheme | undefined;

  /** The content runs up into the title bar. On by default with a `titleBar`. */
  extendsIntoTitleBar?: boolean | undefined;

  /**
   * The title bar's height, and the caption buttons': tall fits a search box
   * or tabs. It applies when the content extends into the title bar.
   */
  titleBarHeight?: TitleBarHeight | undefined;

  /** The colors of the minimize, maximize and close buttons. */
  captionButtons?: CaptionButtonColors | undefined;

  /**
   * Where a press drags the window, in device-independent pixels from the
   * window's top-left corner: a custom title bar's own areas. Without it the
   * `titleBar` snippet (or the system's title bar) is the drag area.
   */
  dragRegions?: readonly WindowRegion[] | undefined;

  /**
   * Parts of a drag area that take the pointer themselves (a search box in
   * the title bar), in device-independent pixels.
   */
  passthroughRegions?: readonly WindowRegion[] | undefined;

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

  /** The window stays above the other windows. Windowed presentation only. */
  isAlwaysOnTop?: boolean | undefined;

  /**
   * In its frame (the default), full screen, or a small always-on-top overlay.
   * The size limits and the buttons below are for the windowed one, and are set
   * again when the window goes back to it.
   */
  presentation?: WindowPresentation | undefined;
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
   * The window this one belongs to: it stays above it, and closes, minimizes
   * and restores with it. Read once, before the window opens.
   */
  owner?: WindowHandle | undefined;

  /**
   * Blocks the `owner` until this window closes. Needs an `owner`. Read once,
   * before the window opens.
   */
  isModal?: boolean | undefined;

  /**
   * false opens the window without taking focus from whatever the user is
   * doing (tests, captures, background starts). Read once.
   */
  activate?: boolean;

  /** The window became the active one (true) or lost that to another (false). */
  onActiveChanged?: (isActive: boolean) => void;

  /**
   * The window is about to close (the user's close button, Alt+F4, or
   * `handle.close()`). Returning true keeps it open: ask the user, then close
   * it again from code. Anything else lets it close.
   */
  onClosing?: () => boolean | void;
  onClosed?: () => void;

  /**
   * The window's scale changed (it moved to a display with another DPI, or the
   * user changed the display's scale): device pixels per device-independent
   * pixel. The size limits and regions follow it.
   */
  onScaleChanged?: (scale: number) => void;

  /**
   * The bounds the window opens with, then whenever it is moved or resized, by
   * the user or by code; in device pixels.
   */
  onBoundsChanged?: (bounds: WindowBounds) => void;
}

/** A size in device pixels. */
export interface WindowSize {
  width: number;
  height: number;
}

/** What `attachWindow` opens a window around, and how. */
export interface AttachOptions {
  content: FrameworkElement;
  props: WindowProps;
  titleBar: () => FrameworkElement | null;

  /** The size it opens at, in device pixels, where the width and height props do not say. */
  size?: WindowSize | undefined;
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
  private readonly content: FrameworkElement;
  private readonly unsubscribe: Array<() => void> = [];
  private appliedBackdrop: Backdrop | null = null;
  private isThemeApplied = false;
  private isPresentationApplied = false;
  private appliedHeight: TitleBarHeight | null = null;
  private appliedCaptionButtons: ReadonlySet<CaptionButtonProperty> = new Set();
  private readonly appliedRegions = new Set<NonClientRegionKind>();
  private readonly openSize: WindowSize | undefined;
  private appliedSize: {
    width: number | undefined;
    height: number | undefined;
  };

  constructor({ content, props, titleBar, size }: AttachOptions) {
    this.props = props;
    this.openSize = size;
    this.content = content;
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
    this.handle.guardClose(() => this.isCloseRefused());
    window.content = content;
    this.keepInLine(() => this.syncText());
    this.keepInLine(() => this.syncBackdrop());
    this.keepInLine(() => this.syncTheme());
    this.keepInLine(() => this.syncTitleBar());
    this.keepInLine(() => this.syncTitleBarLook());
    this.keepInLine(() => this.syncRegions());
    this.keepInLine(() => this.syncPresentation());
    this.keepInLine(() => this.syncLimits());
    this.placeFirst();
    $effect(() => this.syncSize());
    this.syncOwner();
    this.listen();
    this.watchScale();
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

  // A window with no theme prop keeps the system's, and is only written to
  // once an app has set one.
  private syncTheme() {
    const { theme } = this.props;
    const isGiven = theme !== undefined;
    const isUntouched = !isGiven && !this.isThemeApplied;
    if (isUntouched) {
      return;
    }

    this.isThemeApplied = true;
    applyTheme({
      appWindow: this.handle.appWindow,
      content: this.content,
      theme: theme ?? WindowTheme.system
    });
  }

  private syncTitleBarLook() {
    const { appWindow } = this.handle;
    const { titleBarHeight, captionButtons } = this.props;
    const isHeightSet = titleBarHeight !== undefined || this.appliedHeight !== null;
    if (isHeightSet) {
      applyTitleBarHeight({
        appWindow,
        height: titleBarHeight ?? TitleBarHeightKind.standard
      });
      this.appliedHeight = titleBarHeight ?? null;
    }

    this.appliedCaptionButtons = applyCaptionButtonColors({
      appWindow,
      colors: captionButtons,
      applied: this.appliedCaptionButtons
    });
  }

  private syncRegions() {
    const { dragRegions, passthroughRegions } = this.props;
    this.syncRegion({
      kind: NonClientRegionKind.Caption,
      regions: dragRegions
    });
    this.syncRegion({
      kind: NonClientRegionKind.Passthrough,
      regions: passthroughRegions
    });
  }

  private syncRegion({ kind, regions }: {
    kind: NonClientRegionKind;
    regions: readonly WindowRegion[] | undefined;
  }) {
    const isGiven = regions !== undefined;
    const isApplied = this.appliedRegions.has(kind);
    const isUntouched = !isGiven && !isApplied;
    if (isUntouched) {
      return;
    }

    applyRegions({
      appWindow: this.handle.appWindow,
      kind,
      regions: regions ?? [],
      scale: this.handle.scale
    });

    if (isGiven) {
      this.appliedRegions.add(kind);
    } else {
      this.appliedRegions.delete(kind);
    }
  }

  private get isWindowed() {
    const presentation = this.props.presentation ?? WindowPresentation.windowed;
    return presentation === WindowPresentation.windowed;
  }

  // A window with no presentation prop keeps the one it has.
  private syncPresentation() {
    const { presentation } = this.props;
    const isGiven = presentation !== undefined;
    const isUntouched = !isGiven && !this.isPresentationApplied;
    if (isUntouched) {
      return;
    }

    this.isPresentationApplied = isGiven;
    applyPresentation({
      appWindow: this.handle.appWindow,
      presentation: presentation ?? WindowPresentation.windowed
    });
  }

  private syncLimits() {
    if (!this.isWindowed) {
      return;
    }

    const { isAlwaysOnTop, isResizable, isMaximizable, isMinimizable } = this.props;
    const { minWidth, minHeight, maxWidth, maxHeight } = this.props;
    const { presenter, scale } = this.handle;
    if (isGiven(isAlwaysOnTop)) {
      presenter.isAlwaysOnTop = isAlwaysOnTop;
    }

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

  private syncOwner() {
    const { owner, isModal } = this.props;
    const hasOwner = owner !== undefined;
    if (hasOwner) {
      ownWindow({
        hwnd: this.handle.appWindow.id.value,
        owner: owner.appWindow.id.value
      });
    }

    const isModalWithoutOwner = isModal === true && !hasOwner;
    if (isModalWithoutOwner) {
      throw new Error("a modal window needs an owner");
    }

    if (isGiven(isModal)) {
      this.handle.presenter.isModal = isModal;
    }
  }

  // The size and place it opens at: where it was (a dev swap puts the new
  // window where the old one was), else centered.
  private placeFirst() {
    const { props } = this;
    const { appWindow } = this.handle.window;
    const { scale } = this.handle;
    const current = this.openSize ?? appWindow.size;
    const size = {
      width: props.width === undefined ? current.width : round({
        value: props.width,
        scale
      }),
      height: props.height === undefined ? current.height : round({
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

  private isCloseRefused() {
    return this.props.onClosing?.() === true;
  }

  private listen() {
    const { window } = this.handle;
    this.unsubscribe.push(
      window.onActivated((_sender, event) => {
        this.props.onActiveChanged?.(event.windowActivationState !== WindowActivationState.Deactivated);
      }),
      window.appWindow.onClosing((_sender, event) => {
        event.cancel = this.isCloseRefused();
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

  // XamlRoot, which reports the scale, exists once the content is loaded.
  private watchScale() {
    const tracker = createScaleTracker({
      readScale: () => this.handle.scale,
      onChange: scale => {
        this.syncLimits();
        this.syncRegions();
        this.props.onScaleChanged?.(scale);
      }
    });
    this.unsubscribe.push(
      this.content.onceLoaded(() => {
        this.unsubscribe.push(this.content.xamlRoot.onChanged(() => tracker.check()));
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
 * (it is state in the component, the element of its titleBar snippet). Call it
 * where an effect can be created (a component, or an effect root).
 */
export function attachWindow(options: AttachOptions) {
  const host = new WindowHost(options);
  return {
    handle: host.handle,
    dispose: () => host.dispose()
  };
}

/**
 * `attachWindow` for code that is not a component (`createWindow`): the
 * window's effects live in a root of their own, which ends with the window.
 */
export function attachStandaloneWindow(options: AttachOptions) {
  const attached: Array<ReturnType<typeof attachWindow>> = [];
  const stop = $effect.root(() => {
    attached.push(attachWindow(options));
  });
  const [opened] = attached;
  const isOpen = opened !== undefined;
  if (!isOpen) {
    stop();
    throw new Error("the window did not open");
  }

  opened.handle.window.onClosed(stop);
  return opened;
}
