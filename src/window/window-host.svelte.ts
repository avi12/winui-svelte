import type { SizeToContent, WindowAnchor, WindowBounds, WindowSize } from "./anchor.ts";
import { fittedBounds, SizeToContent as SizeToContentKind, WindowAnchor as WindowAnchorKind } from "./anchor.ts";
import {
  applyCaptionButtonColors,
  applyIconShowOptions,
  applyPresentation,
  applyRegions,
  applyShownInSwitchers,
  applyTheme,
  applyTitleBarHeight
} from "./apply-chrome.ts";
import { applyFrameStyle } from "./apply-frame.ts";
import type { Backdrop } from "./backdrop.ts";
import { applyBackdrop, Backdrop as BackdropKind } from "./backdrop.ts";
import { isBackgroundRun } from "./background-mode.ts";
import { backgroundPlacement, keepInBackground } from "./background.ts";
import type {
  CaptionButtonColors,
  CaptionButtonProperty,
  IconShowOptions,
  TitleBarHeight,
  WindowRegion
} from "./chrome.ts";
import {
  IconShowOptions as IconShowOptionsKind,
  TitleBarHeight as TitleBarHeightKind,
  WindowPresentation,
  WindowTheme
} from "./chrome.ts";
import { toDevicePixels } from "./css-pixels.ts";
import {
  changeStyles,
  clearWindowClip,
  clipToRoundedRectangle,
  excludeFromCapture,
  ExtendedStyle,
  joinAppUserModel,
  ownWindow,
  WindowStyle
} from "./native.ts";
import { createScaleTracker } from "./scale.ts";
import { onTeardown } from "./teardown.ts";
import { WindowHandle } from "./window-handle.ts";
import type { FrameworkElement } from "#src/winui.js";
import {
  DisplayArea,
  DisplayAreaFallback,
  Grid,
  NonClientRegionKind,
  ScrollBarVisibility,
  ScrollMode,
  ScrollViewer,
  Window,
  WindowActivationState
} from "#src/winui.js";

export type { WindowBounds, WindowSize } from "./anchor.ts";

// What <Window> (components/hand-written/Window.svelte) does: a native window
// around the component's content, kept in line with its props.

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

  /**
   * Whether the title bar shows the window's icon, and opens the system menu
   * on a click on it; `hideIconAndSystemMenu` takes both away. The default
   * shows them.
   */
  iconShowOptions?: IconShowOptions | undefined;

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

  /**
   * Which sides of the window follow its content: the content is measured
   * after every layout pass and the window is resized to it (frame included,
   * within the size limits) with one `AppWindow.MoveAndResize`, so a growing
   * content never flickers. A side that follows the content ignores the
   * `width` or `height` prop and the user's resizing. Windowed presentation
   * only; the default is `none`.
   */
  sizeToContent?: SizeToContent | undefined;

  /**
   * The corner that stays where it is when the window is sized to its content
   * (and when the scale changes the size): a window docked bottom-right whose
   * content grows taller grows upward. The default is `topLeft`.
   */
  anchor?: WindowAnchor | undefined;

  /** The least the user can resize to, in device-independent pixels. */
  minWidth?: number;
  minHeight?: number;

  /** The most the user can resize to, in device-independent pixels. */
  maxWidth?: number;
  maxHeight?: number;

  /**
   * No frame and no title bar: the window is only its content, as a pill, a
   * toast or a splash screen is. Windowed presentation only.
   */
  isBorderless?: boolean | undefined;

  /**
   * The taskbar button and the Alt+Tab entry. false hides both (the window
   * keeps running); the default shows them.
   */
  isShownInSwitchers?: boolean | undefined;

  /**
   * A tool window: no taskbar button and no Alt+Tab entry, from the first
   * frame. The same effect as `isShownInSwitchers={false}`, as a window style.
   */
  isToolWindow?: boolean | undefined;

  /**
   * false: a click never activates the window, and it never takes focus from
   * what the user is typing in (an overlay, a pill). The default activates.
   */
  isActivatable?: boolean | undefined;

  /** Clicks go to whatever is behind the window. */
  isClickThrough?: boolean | undefined;

  /**
   * Screenshots, screen recordings and screen sharing show the window black
   * (or not at all).
   */
  isExcludedFromCapture?: boolean | undefined;

  /**
   * true opens the window without showing it, and hides it later; false (the
   * default) shows it. Showing it again gives it focus unless `activate` is
   * false.
   */
  isHidden?: boolean | undefined;

  /**
   * Clips the window to a rounded rectangle with this corner radius in
   * device-independent pixels: what is outside the corners shows the desktop.
   * The edge is not anti-aliased.
   */
  cornerRadius?: number | undefined;

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
  onactivechanged?: (isActive: boolean) => void;

  /**
   * The window is about to close (the user's close button, Alt+F4, or
   * `handle.close()`). Returning true keeps it open: ask the user, then close
   * it again from code. Anything else lets it close.
   */
  onclosing?: () => boolean | void;
  onclosed?: () => void;

  /**
   * The window's scale changed (it moved to a display with another DPI, or the
   * user changed the display's scale): device pixels per device-independent
   * pixel. The size limits and regions follow it.
   */
  onscalechanged?: (scale: number) => void;

  /**
   * The bounds the window opens with, then whenever it is moved or resized, by
   * the user or by code; in device pixels.
   */
  onboundschanged?: (bounds: WindowBounds) => void;
}

/** What `attachWindow` opens a window around, and how. */
export interface AttachOptions {
  content: FrameworkElement;
  props: WindowProps;
  titleBar: () => FrameworkElement | null;

  /** The size it opens at, in device pixels, where the width and height props do not say. */
  size?: WindowSize | undefined;
}

// A side of the window in device pixels: the prop's, unless the prop is left
// out or the content sets that side.
function sideOf({ value, current, isFitted, scale }: {
  value: number | undefined;
  current: number;
  isFitted: boolean;
  scale: number;
}) {
  const isKept = value === undefined || isFitted;
  if (isKept) {
    return current;
  }

  return toDevicePixels({
    value,
    scale
  });
}

// A size limit in device pixels; `fallback` when the app names none.
function limitOf({ value, fallback, scale }: {
  value: number | undefined;
  fallback: number;
  scale: number;
}) {
  const isNamed = value !== undefined;
  if (!isNamed) {
    return fallback;
  }

  return toDevicePixels({
    value,
    scale
  });
}

// A prop the app left out is undefined; a guard names the test.
function isGiven<Value>(value: Value | undefined): value is Value {
  return value !== undefined;
}

// Windows whose component is gone while the application goes on, waiting one
// tick for the component that replaces it (a hot update re-creates it) to take
// the same window over; a window nobody takes is closed.
const orphans: Window[] = [];

class WindowHost {
  readonly handle: WindowHandle;
  private readonly props: WindowProps;
  private readonly titleBar: () => FrameworkElement | null;
  private readonly content: FrameworkElement;
  private readonly unsubscribe: Array<() => void> = [];
  private appliedBackdrop: Backdrop | null = null;
  private releaseBackdrop: (() => void) | null = null;
  private isThemeApplied = false;
  private isPresentationApplied = false;
  private appliedHeight: TitleBarHeight | null = null;
  private appliedIconOptions: IconShowOptions | null = null;
  private appliedCaptionButtons: ReadonlySet<CaptionButtonProperty> = new Set();
  private readonly appliedRegions = new Set<NonClientRegionKind>();
  private readonly appliedStyles = new Set<bigint>();
  private isBorderApplied = false;
  private isCaptureApplied = false;
  private isSwitcherApplied = false;
  private isClipApplied = false;
  private isTopApplied = false;
  private hasShown = false;
  private isFitting = false;
  private scroller: ScrollViewer | null = null;
  private readonly isTakenOver: boolean;
  private readonly openSize: WindowSize | undefined;
  private appliedSize: {
    width: number | undefined;
    height: number | undefined;
  };

  constructor({ content, props, titleBar, size }: AttachOptions, orphan: Window | undefined) {
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

    const window = orphan ?? new Window();
    this.isTakenOver = orphan !== undefined;
    this.handle = new WindowHandle(window);

    const isNewBackgroundWindow = isBackgroundRun() && !this.isTakenOver;
    if (isNewBackgroundWindow) {
      keepInBackground(this.handle.appWindow.id.value);
    }

    this.handle.guardClose(() => this.isCloseRefused());
    window.content = content;
    this.keepInLine(() => this.syncContainer());
    this.keepInLine(() => this.syncText());
    this.keepInLine(() => this.syncBackdrop());
    this.keepInLine(() => this.syncTheme());
    this.keepInLine(() => this.syncTitleBar());
    this.keepInLine(() => this.syncTitleBarLook());
    this.keepInLine(() => this.syncRegions());
    this.keepInLine(() => this.syncPresentation());
    this.keepInLine(() => this.syncLimits());
    this.keepInLine(() => this.syncFrame());
    this.keepInLine(() => this.syncShape());

    if (!this.isTakenOver) {
      this.placeFirst();
    }

    $effect(() => this.syncSize());
    $effect(() => this.fitToContent());
    this.syncOwner();
    this.listen();
    this.watchScale();
    this.show();
    $effect(() => this.syncVisibility());
  }

  /**
   * Ends the host. `isClosedLater`: its component is going while the
   * application goes on (a hot update re-creates it). The window is not closed
   * but offered for one tick to the component that replaces it, which takes it
   * over (no relaunch), and closed if nobody does. Closing it during the
   * component's teardown is no option: WinUI aborts Window.Close (E_ABORT).
   */
  dispose(isClosedLater: boolean) {
    this.releaseBackdrop?.();
    this.releaseBackdrop = null;
    for (const unsubscribe of this.unsubscribe.splice(0)) {
      unsubscribe();
    }

    this.handle.guardClose(() => false);

    if (isClosedLater) {
      const { window } = this.handle;
      orphans.push(window);
      setTimeout(() => this.closeIfOrphan(window), 0);
      return;
    }

    this.handle.close();
  }

  private closeIfOrphan(window: Window) {
    const index = orphans.indexOf(window);
    const isOrphan = index !== -1;
    if (isOrphan) {
      orphans.splice(index, 1);
      this.handle.close();
    }
  }

  // Applied now, so the window opens as it is meant to, and again whenever
  // what `sync` reads changes.
  private keepInLine(sync: () => void) {
    sync();
    $effect(sync);
  }

  // A measure offers an element the space it has and clamps what it asks for
  // to that, so a root as large as the window could never ask for more or
  // less than the window is. Inside a ScrollViewer that may scroll along a
  // side the content sets, the root is offered all the room there (the
  // scroll bars stay hidden), and what it asks for is what it needs.
  private syncContainer() {
    const { isWidthFitted, isHeightFitted } = this.fittedSides;
    const isAnySideFitted = isWidthFitted || isHeightFitted;
    const isFitted = isAnySideFitted && this.isWindowed;
    const { window } = this.handle;
    if (!isFitted) {
      this.uncontain();
      return;
    }

    const scroller = this.scroller ?? new ScrollViewer();
    scroller.horizontalScrollBarVisibility = isWidthFitted ? ScrollBarVisibility.Hidden : ScrollBarVisibility.Disabled;
    scroller.horizontalScrollMode = isWidthFitted ? ScrollMode.Enabled : ScrollMode.Disabled;
    scroller.verticalScrollBarVisibility = isHeightFitted ? ScrollBarVisibility.Hidden : ScrollBarVisibility.Disabled;
    scroller.verticalScrollMode = isHeightFitted ? ScrollMode.Enabled : ScrollMode.Disabled;
    const isContained = this.scroller !== null;
    if (isContained) {
      return;
    }

    window.content = new Grid();
    scroller.content = this.content;
    window.content = scroller;
    this.scroller = scroller;
  }

  private uncontain() {
    const { scroller } = this;
    const isContained = scroller !== null;
    if (!isContained) {
      return;
    }

    const { window } = this.handle;
    window.content = new Grid();
    scroller.content = null;
    window.content = this.content;
    this.scroller = null;
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
      this.releaseBackdrop?.();
      this.releaseBackdrop = applyBackdrop({
        window: this.handle.window,
        content: this.content,
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

    const { iconShowOptions } = this.props;
    const isIconSet = iconShowOptions !== undefined || this.appliedIconOptions !== null;
    if (isIconSet) {
      applyIconShowOptions({
        appWindow,
        options: iconShowOptions ?? IconShowOptionsKind.showIconAndSystemMenu
      });
      this.appliedIconOptions = iconShowOptions ?? null;
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

    if (isBackgroundRun()) {
      // A presenter (full screen, compact overlay) puts the window on a display.
      this.handle.appWindow.moveAndResize(backgroundPlacement(this.handle.appWindow.size));
    }
  }

  private syncLimits() {
    if (!this.isWindowed) {
      return;
    }

    const { isAlwaysOnTop, isResizable, isMaximizable, isMinimizable } = this.props;
    const { minWidth, minHeight, maxWidth, maxHeight } = this.props;
    const { presenter, scale } = this.handle;
    const isTopChanged = isGiven(isAlwaysOnTop) || this.isTopApplied;
    if (isTopChanged) {
      presenter.isAlwaysOnTop = isAlwaysOnTop ?? false;
      this.isTopApplied = isGiven(isAlwaysOnTop);
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
      presenter.preferredMinimumWidth = toDevicePixels({
        value: minWidth,
        scale
      });
    }

    if (isGiven(minHeight)) {
      presenter.preferredMinimumHeight = toDevicePixels({
        value: minHeight,
        scale
      });
    }

    if (isGiven(maxWidth)) {
      presenter.preferredMaximumWidth = toDevicePixels({
        value: maxWidth,
        scale
      });
    }

    if (isGiven(maxHeight)) {
      presenter.preferredMaximumHeight = toDevicePixels({
        value: maxHeight,
        scale
      });
    }
  }

  // The window styles, the borderless presenter and the capture affinity: all
  // left alone until the app names them.
  private syncFrame() {
    const hwnd = this.handle.appWindow.id.value;
    const { isActivatable, isToolWindow, isClickThrough, isExcludedFromCapture, isShownInSwitchers } = this.props;
    const hasActivatable = isGiven(isActivatable);
    const frameStyles = [
      {
        style: {
          styles: ExtendedStyle.noActivate,
          isKeptInBackground: true
        },
        isOn: hasActivatable ? !isActivatable : undefined
      },
      {
        style: {
          styles: ExtendedStyle.toolWindow,
          isKeptInBackground: true
        },
        isOn: isToolWindow
      },
      {
        style: {
          styles: ExtendedStyle.transparent,
          isLayered: true
        },
        isOn: isClickThrough
      }
    ];
    for (const { style, isOn } of frameStyles) {
      applyFrameStyle({
        hwnd,
        style,
        isOn,
        applied: this.appliedStyles
      });
    }

    const isCaptureGiven = isGiven(isExcludedFromCapture);
    const isCaptureChanged = isCaptureGiven || this.isCaptureApplied;
    if (isCaptureChanged) {
      excludeFromCapture({
        hwnd,
        isExcluded: isExcludedFromCapture === true
      });
      this.isCaptureApplied = isCaptureGiven;
    }

    const isSwitcherGiven = isGiven(isShownInSwitchers);
    const isSwitcherChanged = isSwitcherGiven || this.isSwitcherApplied;
    if (isSwitcherChanged) {
      applyShownInSwitchers({
        appWindow: this.handle.appWindow,
        isShown: isShownInSwitchers ?? true
      });
      this.isSwitcherApplied = isSwitcherGiven;
    }

    this.syncBorder();
  }

  private syncBorder() {
    const { isBorderless } = this.props;
    const isGivenNow = isGiven(isBorderless);
    const isChanged = this.isWindowed && (isGivenNow || this.isBorderApplied);
    if (!isChanged) {
      return;
    }

    const hasFrame = isBorderless !== true;
    this.handle.presenter.setBorderAndTitleBar(hasFrame, hasFrame);

    if (!hasFrame) {
      // The presenter leaves the dialog frame: a white 3 pixel edge inside the
      // window that the content does not cover, and a client area smaller
      // than the window.
      changeStyles({
        hwnd: this.handle.appWindow.id.value,
        styles: WindowStyle.dialogFrame,
        isOn: false
      });
    }

    this.isBorderApplied = isGivenNow;
  }

  // Clipped to its rounded rectangle; again whenever the size or the scale
  // changes, since the clip is in pixels.
  private syncShape() {
    const { cornerRadius } = this.props;
    const isRounded = isGiven(cornerRadius);
    const isChanged = isRounded || this.isClipApplied;
    if (!isChanged) {
      return;
    }

    const hwnd = this.handle.appWindow.id.value;
    this.isClipApplied = isRounded;

    if (!isRounded) {
      clearWindowClip(hwnd);
      return;
    }

    const { width, height } = this.handle.appWindow.size;
    clipToRoundedRectangle({
      hwnd,
      width,
      height,
      radius: toDevicePixels({
        value: cornerRadius,
        scale: this.handle.scale
      })
    });
  }

  // A window that is hidden stays so until the prop changes; the first show
  // (show()) already honors it.
  private syncVisibility() {
    const isHidden = this.props.isHidden === true;
    if (!this.hasShown) {
      return;
    }

    const { appWindow } = this.handle;
    if (isHidden) {
      appWindow.hide();
      return;
    }

    const isHiddenNow = !appWindow.isVisible;
    if (isHiddenNow) {
      this.showWindow();
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
      width: props.width === undefined ? current.width : toDevicePixels({
        value: props.width,
        scale
      }),
      height: props.height === undefined ? current.height : toDevicePixels({
        value: props.height,
        scale
      })
    };
    if (isBackgroundRun()) {
      appWindow.moveAndResize(
        backgroundPlacement({
          width: props.placement?.width ?? size.width,
          height: props.placement?.height ?? size.height
        })
      );
      return;
    }

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
  // undone, since the props did not change. A side that follows the content
  // (sizeToContent) is the content's to set.
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
    const { isWidthFitted, isHeightFitted } = this.fittedSides;
    appWindow.resize({
      width: sideOf({
        value: width,
        current: appWindow.size.width,
        isFitted: isWidthFitted,
        scale
      }),
      height: sideOf({
        value: height,
        current: appWindow.size.height,
        isFitted: isHeightFitted,
        scale
      })
    });
  }

  private get fittedSides() {
    const mode = this.props.sizeToContent ?? SizeToContentKind.none;
    return {
      isWidthFitted: mode === SizeToContentKind.width || mode === SizeToContentKind.both,
      isHeightFitted: mode === SizeToContentKind.height || mode === SizeToContentKind.both
    };
  }

  // Sizes the window to what its content asks for, whenever the prop, the
  // limits, the scale or a layout pass changes it: one MoveAndResize, so the
  // anchor corner never moves between the size and the position.
  private fitToContent() {
    const mode = this.props.sizeToContent ?? SizeToContentKind.none;
    const anchor = this.props.anchor ?? WindowAnchorKind.topLeft;
    const { minWidth, minHeight, maxWidth, maxHeight } = this.props;
    const isIdle = mode === SizeToContentKind.none || !this.isWindowed || this.isFitting;
    if (isIdle) {
      return;
    }

    const { desiredSize } = this.content;
    const isMeasured = desiredSize.width > 0 && desiredSize.height > 0;
    if (!isMeasured) {
      return;
    }

    const { appWindow, scale } = this.handle;
    const { size, position, clientSize } = appWindow;
    const frame = {
      width: size.width - clientSize.width,
      height: size.height - clientSize.height
    };
    const target = fittedBounds({
      bounds: {
        ...position,
        ...size
      },
      desired: {
        width: toDevicePixels({
          value: desiredSize.width,
          scale
        }) + frame.width,
        height: toDevicePixels({
          value: desiredSize.height,
          scale
        }) + frame.height
      },
      mode,
      anchor,
      limits: {
        minWidth: limitOf({
          value: minWidth,
          fallback: 0,
          scale
        }),
        minHeight: limitOf({
          value: minHeight,
          fallback: 0,
          scale
        }),
        maxWidth: limitOf({
          value: maxWidth,
          fallback: Infinity,
          scale
        }),
        maxHeight: limitOf({
          value: maxHeight,
          fallback: Infinity,
          scale
        })
      }
    });
    const hasTarget = target !== null;
    if (!hasTarget) {
      return;
    }

    this.isFitting = true;
    try {
      appWindow.moveAndResize(target);
    } finally {
      this.isFitting = false;
    }
  }

  private isCloseRefused() {
    return this.props.onclosing?.() === true;
  }

  private listen() {
    const { window } = this.handle;
    this.unsubscribe.push(
      window.onActivated((_sender, event) => {
        this.props.onactivechanged?.(event.windowActivationState !== WindowActivationState.Deactivated);
      }),
      window.appWindow.onClosing((_sender, event) => {
        event.cancel = this.isCloseRefused();
      }),
      window.onClosed(() => {
        // A DesktopAcrylicController left attached crashes the process when the
        // window goes (access violation at exit).
        this.releaseBackdrop?.();
        this.releaseBackdrop = null;
        this.props.onclosed?.();
      }),
      this.content.onLayoutUpdated(() => this.fitToContent()),
      window.appWindow.onChanged((_sender, event) => {
        const isMoved = event.didPositionChange || event.didSizeChange;
        if (isMoved) {
          this.reportBounds();
        }

        if (event.didSizeChange) {
          this.syncShape();
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
        this.syncShape();
        this.fitToContent();
        this.props.onscalechanged?.(scale);
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
    this.props.onboundschanged?.({
      x: position.x,
      y: position.y,
      width: size.width,
      height: size.height
    });
  }

  // Shown, and then the bounds it opened with are reported: an app that keeps
  // them (to reopen where the window was) needs them before the user moves it.
  private show() {
    const isHidden = this.props.isHidden === true;
    const isToShow = !isHidden && !this.isTakenOver;
    if (isToShow) {
      this.showWindow();
    }

    this.hasShown = true;
    this.syncShape();
    this.reportBounds();
  }

  private showWindow() {
    const { window } = this.handle;
    const isBackground = this.props.activate === false || isBackgroundRun();
    if (isBackground) {
      window.appWindow.showWithActivation(false);
    } else {
      window.activate();
    }
  }
}

/**
 * Opens the window around `content`; `titleBar` is read whenever it is needed
 * (it is state in the component, the element of its titleBar snippet). Call it
 * where an effect can be created (a component, or an effect root).
 */
export function attachWindow(options: AttachOptions) {
  const host = new WindowHost(options, orphans.shift());
  const forget = onTeardown(() => host.dispose(false));
  host.handle.window.onClosed(forget);
  return {
    handle: host.handle,
    dispose() {
      forget();
      host.dispose(true);
    }
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
