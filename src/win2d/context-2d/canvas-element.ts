import { Context2D } from "./context.ts";
import { Surface } from "./surface.ts";
import { sharedDevice } from "#src/win2d/resources.js";
import type { CanvasDevice } from "#winui/microsoft/graphics/canvas/CanvasDevice";

const DEFAULT_WIDTH = 300;
const DEFAULT_HEIGHT = 150;
const CONTEXT_KIND = "2d";

/** The event a canvas hands its listeners: the members of a DOM event that a pointer or wheel event has. */
export interface CanvasEvent {
  type: string;
  target: CanvasElement | null;
  currentTarget: CanvasElement | null;
  defaultPrevented: boolean;
  timeStamp: number;
  preventDefault(): void;
  stopPropagation(): void;
  stopImmediatePropagation(): void;
  [member: string]: unknown;
}

/** A listener of a canvas: a function, or an object with `handleEvent`. */
export type CanvasListener = ((event: CanvasEvent) => void) | { handleEvent(event: CanvasEvent): void };

/** The options addEventListener takes that mean something here. */
export interface ListenerOptions {
  once?: boolean;
  signal?: AbortSignal;
}

/**
 * What a canvas is made with: its size in pixels (300 by 150 by default) and
 * the Win2D device (the shared one by default).
 */
export interface CanvasElementOptions {
  width?: number | undefined;
  height?: number | undefined;
  device?: CanvasDevice | undefined;
}

/** The members of a canvas's `style` that libraries set; any other can be set too. */
class CanvasStyle {
  [property: string]: unknown;
  width = "";
  height = "";
  display = "";
  cursor = "";
  position = "";
  boxSizing = "";
  touchAction = "";
  userSelect = "";

  /** Sets a property by its CSS name (`box-sizing`) or its camelCase one. */
  setProperty(name: string, value: string) {
    this[camelCase(name)] = value;
  }

  /** The value of a property, or an empty string. */
  getPropertyValue(name: string) {
    const value = this[camelCase(name)];
    return typeof value === "string" ? value : "";
  }

  /** Clears a property; returns what it was. */
  removeProperty(name: string) {
    const previous = this.getPropertyValue(name);
    this.setProperty(name, "");
    return previous;
  }
}

/** What getBoundingClientRect returns: the canvas has no page, so it sits at the origin. */
export interface BoundingRectangle {
  x: number;
  y: number;
  left: number;
  top: number;
  right: number;
  bottom: number;
  width: number;
  height: number;
}

function camelCase(name: string) {
  return name.replaceAll(/-([a-z])/gu, (_match, letter: string) => letter.toUpperCase());
}

function sizeOf(value: unknown) {
  const number = Math.trunc(Number(value));
  const isSize = Number.isFinite(number) && number >= 0;
  return isSize ? number : 0;
}

/**
 * The stand-in for an HTML canvas element: `getContext("2d")` gives a
 * Context2D that draws with Win2D on a render target this canvas owns. It has
 * the members a drawing library reads (`width`, `height`, `style`,
 * `getBoundingClientRect`, `addEventListener`...). Make one with
 * `createCanvas2D`, or take the one a `Canvas2D` component shows.
 */
export class CanvasElement {
  /** The inline style; libraries set `display` and the CSS size here. */
  readonly style = new CanvasStyle();
  private readonly surface: Surface;
  private context: Context2D | undefined;
  private pixelWidth: number;
  private pixelHeight: number;
  // Per event type, each listener and whether it runs only once.
  private readonly listeners = new Map<string, Map<CanvasListener, boolean>>();

  constructor({ device = sharedDevice(), width = DEFAULT_WIDTH, height = DEFAULT_HEIGHT }: CanvasElementOptions = {}) {
    this.pixelWidth = sizeOf(width);
    this.pixelHeight = sizeOf(height);
    this.surface = new Surface({
      device,
      width: this.pixelWidth,
      height: this.pixelHeight
    });
  }

  private resize({ width, height }: {
    width: number;
    height: number;
  }) {
    this.pixelWidth = width;
    this.pixelHeight = height;
    this.surface.reset({
      width,
      height
    });
    this.context?.resetState();
  }

  /** The width in pixels. Setting it (even to the same value) clears the canvas and resets the context. */
  get width() {
    return this.pixelWidth;
  }

  set width(value: number) {
    this.resize({
      width: sizeOf(value),
      height: this.pixelHeight
    });
  }

  /** The height in pixels. Setting it (even to the same value) clears the canvas and resets the context. */
  get height() {
    return this.pixelHeight;
  }

  set height(value: number) {
    this.resize({
      width: this.pixelWidth,
      height: sizeOf(value)
    });
  }

  /** The width the canvas is shown at, which is its width. */
  get clientWidth() {
    return this.pixelWidth;
  }

  /** The height the canvas is shown at, which is its height. */
  get clientHeight() {
    return this.pixelHeight;
  }

  /** The width the canvas is laid out at, which is its width. */
  get offsetWidth() {
    return this.pixelWidth;
  }

  /** The height the canvas is laid out at, which is its height. */
  get offsetHeight() {
    return this.pixelHeight;
  }

  /** The canvas has no parent: it is not in a document. */
  get parentNode() {
    return null;
  }

  /** The canvas is not in a document. */
  get isConnected() {
    return false;
  }

  /** The canvas's pixels as a Win2D render target (an image to draw elsewhere); drawing waits for it. */
  get target() {
    return this.surface.target;
  }

  /** The Win2D device the canvas draws on. */
  get device() {
    return this.surface.device;
  }

  /**
   * The 2D context (the same object every time), or null for a context that is
   * not `2d`: Win2D has no WebGL or bitmaprenderer.
   */
  getContext(kind: string, _options?: object) {
    const isOther = kind !== CONTEXT_KIND;
    if (isOther) {
      return null;
    }

    this.context ??= new Context2D({
      canvas: this,
      surface: this.surface
    });
    return this.context;
  }

  /** Where the canvas sits: at the origin, at its size. */
  getBoundingClientRect() {
    return {
      x: 0,
      y: 0,
      left: 0,
      top: 0,
      right: this.pixelWidth,
      bottom: this.pixelHeight,
      width: this.pixelWidth,
      height: this.pixelHeight
    } satisfies BoundingRectangle;
  }

  /** Moves the canvas to another device (after the old one was lost); the pixels start blank and the context resets. */
  useDevice(device: CanvasDevice) {
    this.surface.reset({
      width: this.pixelWidth,
      height: this.pixelHeight,
      device
    });
    this.context?.resetState();
  }

  /** Calls a function after each change to the pixels; returns the function that stops it. */
  watch(listener: () => void) {
    return this.surface.watch(listener);
  }

  /** Adds a listener for an event type (`pointerdown`, `pointermove`, `wheel`...). */
  addEventListener(type: string, listener: CanvasListener | null, options?: boolean | ListenerOptions) {
    const details = options instanceof Object ? options : {};
    const isAborted = details.signal?.aborted === true;
    const isIgnored = listener === null || isAborted;
    if (isIgnored) {
      return;
    }

    const forType = this.listeners.get(type) ?? new Map<CanvasListener, boolean>();
    this.listeners.set(type, forType);
    forType.set(listener, details.once === true);
    details.signal?.addEventListener("abort", () => forType.delete(listener), { once: true });
  }

  /** Removes a listener added with the same type. */
  removeEventListener(type: string, listener: CanvasListener | null, _options?: boolean | ListenerOptions) {
    const hasListener = listener !== null;
    if (hasListener) {
      this.listeners.get(type)?.delete(listener);
    }
  }

  /** Hands an event to the listeners of its type; returns false if one called `preventDefault`. */
  dispatchEvent(event: Pick<CanvasEvent, "type"> & Partial<CanvasEvent>) {
    let isPrevented = false;
    let isStopped = false;
    const full: CanvasEvent = {
      timeStamp: performance.now(),
      ...event,
      target: this,
      currentTarget: this,
      defaultPrevented: false,
      preventDefault() {
        isPrevented = true;
        full.defaultPrevented = true;
      },
      stopPropagation() {
        // The canvas has no parent to propagate to.
      },
      stopImmediatePropagation() {
        isStopped = true;
      }
    };
    const forType = this.listeners.get(event.type);
    for (const [listener, isOnce] of forType ?? []) {
      if (isStopped) {
        break;
      }

      if (isOnce) {
        forType?.delete(listener);
      }

      const isFunction = typeof listener === "function";
      if (isFunction) {
        listener(full);
      } else {
        listener.handleEvent(full);
      }
    }

    return !isPrevented;
  }
}

/**
 * A canvas that draws off screen, on the shared Win2D device: no window needed.
 * Call it after the Windows App SDK started (`initWindowsAppSdk`).
 */
export function createCanvas2D(options: CanvasElementOptions = {}) {
  return new CanvasElement(options);
}
