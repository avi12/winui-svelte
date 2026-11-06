import { HandlerEventTarget } from "./event-handlers.ts";
import { toCssPixels } from "#src/window/css-pixels.js";
import type { AppWindow, Window } from "#src/winui.js";

/** The title bar as Windows has it, in device pixels. */
export interface TitleBarReading {
  /** The content extends into the title bar, so the overlay is in use. */
  readonly isVisible: boolean;

  /** The system-reserved width at the left edge (the icon, or the caption buttons of a right-to-left window). */
  readonly leftInset: number;

  /** The system-reserved width at the right edge (the caption buttons). */
  readonly rightInset: number;
  readonly titleBarHeight: number;
  readonly clientWidth: number;

  /** Device pixels per CSS pixel. */
  readonly scale: number;
}

/** What `WindowControlsOverlay` asks of the window; a test stands in for it. */
export interface TitleBarSource {
  read(): TitleBarReading;

  /** Calls `notify` when the title bar may have changed; returns what stops it. */
  watch(notify: () => void): () => void;
}

/** The area of the title bar the content may use, like a `DOMRect`. */
export interface TitlebarAreaRect {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
  readonly left: number;
  readonly top: number;
  readonly right: number;
  readonly bottom: number;
}

/** A `geometrychange` of the overlay. */
export class WindowControlsOverlayGeometryChangeEvent extends Event {
  /** The area now. */
  readonly titlebarAreaRect: TitlebarAreaRect;

  /** Whether the overlay is in use now. */
  // eslint-disable-next-line @typescript-eslint/naming-convention -- the standard member name
  readonly visible: boolean;

  constructor(type: string, init: {
    titlebarAreaRect: TitlebarAreaRect;
    visible: boolean;
  }) {
    super(type);
    this.titlebarAreaRect = init.titlebarAreaRect;
    this.visible = init.visible;
  }
}

function rectOf(reading: TitleBarReading) {
  const { scale } = reading;
  if (!reading.isVisible) {
    return {
      x: 0,
      y: 0,
      width: 0,
      height: 0,
      left: 0,
      top: 0,
      right: 0,
      bottom: 0
    } satisfies TitlebarAreaRect;
  }

  const x = toCssPixels({
    value: reading.leftInset,
    scale
  });
  const width = toCssPixels({
    value: reading.clientWidth - reading.leftInset - reading.rightInset,
    scale
  });
  const height = toCssPixels({
    value: reading.titleBarHeight,
    scale
  });
  return {
    x,
    y: 0,
    width,
    height,
    left: x,
    top: 0,
    right: x + width,
    bottom: height
  } satisfies TitlebarAreaRect;
}

function sameRect({ first, second }: {
  first: TitlebarAreaRect;
  second: TitlebarAreaRect;
}) {
  return first.x === second.x && first.width === second.width && first.height === second.height;
}

/**
 * A window's title bar area as `navigator.windowControlsOverlay` has it: where
 * the content may draw in the title bar next to the system's icon and caption
 * buttons, in CSS pixels. `handle.windowControlsOverlay` gives each window its
 * own (there is no `navigator` for one window of a process).
 */
export class WindowControlsOverlay extends HandlerEventTarget {
  private readonly source: TitleBarSource;
  private readonly stop: () => void;
  private lastRect: TitlebarAreaRect;
  private isPreviouslyVisible: boolean;

  /** Made by `WindowHandle`. */
  constructor(source: TitleBarSource) {
    super();
    this.source = source;
    const reading = source.read();
    this.lastRect = rectOf(reading);
    this.isPreviouslyVisible = reading.isVisible;
    this.stop = source.watch(() => this.check());
  }

  /** True when the content extends into the title bar (the overlay is in use). */
  get visible() {
    return this.source.read().isVisible;
  }

  get ongeometrychange() {
    return this.getHandler("geometrychange");
  }

  set ongeometrychange(handler: EventListener | null) {
    this.setHandler({
      type: "geometrychange",
      handler
    });
  }

  /**
   * The part of the title bar the content may use: from the system's icon (or
   * the caption buttons of a right-to-left window) to the caption buttons.
   *
   * @returns The rectangle in CSS pixels from the window's top-left corner;
   *   all zeros while the content does not extend into the title bar.
   */
  getTitlebarAreaRect() {
    return rectOf(this.source.read());
  }

  /** Stops following the window; called when it closes. */
  dispose() {
    this.stop();
  }

  private check() {
    const reading = this.source.read();
    const rect = rectOf(reading);
    const isChanged = reading.isVisible !== this.isPreviouslyVisible || !sameRect({
      first: rect,
      second: this.lastRect
    });
    if (!isChanged) {
      return;
    }

    this.lastRect = rect;
    this.isPreviouslyVisible = reading.isVisible;
    this.dispatchEvent(
      new WindowControlsOverlayGeometryChangeEvent("geometrychange", {
        titlebarAreaRect: rect,
        visible: reading.isVisible
      })
    );
  }

  get [Symbol.toStringTag]() {
    return "WindowControlsOverlay";
  }
}

/**
 * The title bar source over a real window: `AppWindowTitleBar`'s insets and
 * height, and the content's reach into it.
 *
 * @param options - The window, its `AppWindow`, and how to read its scale.
 * @returns The source.
 */
export function windowTitleBarSource({ window, appWindow, readScale }: {
  window: Window;
  appWindow: AppWindow;
  readScale: () => number;
}) {
  return {
    read() {
      const { titleBar } = appWindow;
      return {
        isVisible: window.extendsContentIntoTitleBar,
        leftInset: titleBar.leftInset,
        rightInset: titleBar.rightInset,
        titleBarHeight: titleBar.height,
        clientWidth: appWindow.clientSize.width,
        scale: readScale()
      };
    },
    watch: notify => appWindow.onChanged(() => notify())
  } satisfies TitleBarSource;
}
