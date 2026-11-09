import { createSchema, getInfoSchema, updateSchema, windowIdSchema } from "./window-schema.ts";
import type { ChromeWindowSurface } from "./window-surface.ts";
import { WINDOW_ID_CURRENT, WINDOW_ID_NONE, WindowState, WindowType } from "./window-types.ts";
import type { ChromeWindow, CreateWindowData, GetWindowInfo, UpdateWindowInfo } from "./window-types.ts";
import { parseOrThrow } from "#src/chrome/parse-or-throw.js";
import { ChromeEvent } from "#src/downloads/chrome-event.js";
import type { WindowBounds } from "#src/window/anchor.js";

/** What `ChromeWindows` takes. */
export interface ChromeWindowsOptions {
  /**
   * Opens the window `create` was asked for: with `createWindow`, make the
   * content the app wants and return `chromeWindowSurface(opened.handle)`.
   * The `left`, `top`, `width`, `height`, `state` and `focused` of the data are
   * applied afterwards, so `open` need not read them. Without it `create`
   * rejects.
   */
  readonly open?: ((data: CreateWindowData) => ChromeWindowSurface | Promise<ChromeWindowSurface>) | undefined;
}

/** What `track` takes. */
export interface TrackOptions {
  /** The window; `chromeWindowSurface(handle)` makes one of a `WindowHandle`. */
  readonly surface: ChromeWindowSurface;

  /** Whether `getCurrent` and `WINDOW_ID_CURRENT` mean this window; the last window tracked with it wins. */
  readonly isCurrent?: boolean | undefined;
}

interface Entry {
  readonly id: number;
  readonly surface: ChromeWindowSurface;
  readonly stops: ReadonlyArray<() => void>;
}

function definedSide({ key, value }: {
  key: keyof WindowBounds;
  value: number | undefined;
}) {
  const isGiven = value !== undefined;
  return isGiven ? { [key]: value } : {};
}

const BOUNDS_KEYS = ["left", "top", "width", "height"] as const;

/**
 * `chrome.windows` for the windows of a Windows app. The app tells it about
 * its windows (`track`, or `create` through `open`), because no process-wide
 * list of windows exists: a window is known to it, and has an id, from the
 * moment it is tracked until it closes. Sizes and places are in device pixels,
 * as `AppWindow` has them. Tabs do not exist, so `populate` and `windowTypes`
 * change nothing, and every window is `normal` and not `incognito`. Call it on
 * the UI thread.
 */
export class ChromeWindows {
  /** Fires with the new window when one is tracked. */
  readonly onCreated = new ChromeEvent<(window: ChromeWindow) => void>();

  /** Fires with the id of a window that closed. */
  readonly onRemoved = new ChromeEvent<(windowId: number) => void>();

  /** Fires with the id of the window that got focus, or `WINDOW_ID_NONE` when focus left the app's windows. */
  readonly onFocusChanged = new ChromeEvent<(windowId: number) => void>();

  /** Fires with the window after it moved or resized. */
  readonly onBoundsChanged = new ChromeEvent<(window: ChromeWindow) => void>();
  private readonly open: ChromeWindowsOptions["open"];
  private readonly entries = new Map<number, Entry>();
  private nextId = 1;
  private currentId = WINDOW_ID_NONE;
  private lastFocusedId = WINDOW_ID_NONE;
  private focusedId = WINDOW_ID_NONE;

  constructor(options: ChromeWindowsOptions = {}) {
    this.open = options.open;
  }

  /**
   * Starts reporting a window and gives it an id.
   *
   * @param options - The window, and whether it is the current one.
   * @returns The window as it is now.
   */
  track({ surface, isCurrent = false }: TrackOptions) {
    const id = this.nextId;
    this.nextId += 1;
    const stops = [
      surface.onFocusChanged(isFocused => this.focusChanged({
        id,
        isFocused
      })),
      surface.onBoundsChanged(() => this.onBoundsChanged.dispatch(this.describe(id))),
      surface.onClosed(() => this.closed(id))
    ];
    this.entries.set(id, {
      id,
      surface,
      stops
    });

    if (isCurrent) {
      this.currentId = id;
    }

    if (surface.isFocused()) {
      this.focusChanged({
        id,
        isFocused: true
      });
    }

    const window = this.describe(id);
    this.onCreated.dispatch(window);
    return window;
  }

  /**
   * Opens a window with the `open` option and applies the data to it.
   *
   * @param createData - Place, size, state and focus; the rest goes to `open` as it is.
   * @returns The window that opened.
   */
  async create(createData?: CreateWindowData) {
    const data = parseOrThrow({
      schema: createSchema.optional(),
      input: createData
    }) ?? {};
    const { open } = this;
    const isOpenMissing = open === undefined;
    if (isOpenMissing) {
      throw new Error("create needs the open option: it is what makes the content of a window");
    }

    const surface = await open(data);
    const { id } = this.track({ surface });
    await this.update(id, data);
    return this.describe(id);
  }

  /**
   * Describes a window.
   *
   * @param windowId - An id, or `WINDOW_ID_CURRENT`.
   * @param queryOptions - Accepted and ignored.
   * @returns The window; rejects when there is none with that id.
   */
  // eslint-disable-next-line no-restricted-syntax -- chrome.windows.get(windowId, queryOptions) is positional
  async get(windowId: number, queryOptions?: GetWindowInfo) {
    parseOrThrow({
      schema: getInfoSchema,
      input: queryOptions
    });
    return this.describe(this.entryOf(windowId).id);
  }

  /**
   * Describes the current window.
   *
   * @param queryOptions - Accepted and ignored.
   * @returns The window `track` marked current, else the last focused; rejects when there is none.
   */
  async getCurrent(queryOptions?: GetWindowInfo) {
    return this.get(WINDOW_ID_CURRENT, queryOptions);
  }

  /**
   * Describes the window that had focus last.
   *
   * @param queryOptions - Accepted and ignored.
   * @returns The window that had focus last; rejects when there is none.
   */
  async getLastFocused(queryOptions?: GetWindowInfo) {
    parseOrThrow({
      schema: getInfoSchema,
      input: queryOptions
    });
    const entry = this.entries.get(this.lastFocusedId) ?? this.entries.values().next().value;
    const isMissing = entry === undefined;
    if (isMissing) {
      throw new Error("No last focused window");
    }

    return this.describe(entry.id);
  }

  /**
   * Describes every window.
   *
   * @param queryOptions - Accepted and ignored.
   * @returns Every tracked window, in the order they were tracked.
   */
  async getAll(queryOptions?: GetWindowInfo) {
    parseOrThrow({
      schema: getInfoSchema,
      input: queryOptions
    });
    return [...this.entries.keys()].map(id => this.describe(id));
  }

  /**
   * Moves, resizes, changes the state of, focuses or flashes a window. A
   * place or size needs the window to be `normal`, as in Chrome, and
   * `focused` cannot go with `minimized`.
   *
   * @param windowId - An id, or `WINDOW_ID_CURRENT`.
   * @param updateInfo - What to change.
   * @returns The window after the change.
   */
  // eslint-disable-next-line no-restricted-syntax -- chrome.windows.update(windowId, updateInfo) is positional
  async update(windowId: number, updateInfo: UpdateWindowInfo) {
    const info = parseOrThrow({
      schema: updateSchema,
      input: updateInfo
    });
    const { surface, id } = this.entryOf(windowId);
    const { state } = info;
    const hasBounds = BOUNDS_KEYS.some(key => info[key] !== undefined);
    const isStateGiven = state !== undefined;
    const isBoundsOutsideNormal = hasBounds && isStateGiven && state !== WindowState.normal;
    if (isBoundsOutsideNormal) {
      throw new Error("The window must be normal to change its place or size");
    }

    const isFocusingMinimized = info.focused === true && state === WindowState.minimized;
    if (isFocusingMinimized) {
      throw new Error("A minimized window cannot be focused");
    }

    if (isStateGiven) {
      surface.setState(state);
    }

    if (hasBounds) {
      surface.setBounds({
        ...definedSide({
          key: "x",
          value: info.left
        }),
        ...definedSide({
          key: "y",
          value: info.top
        }),
        ...definedSide({
          key: "width",
          value: info.width
        }),
        ...definedSide({
          key: "height",
          value: info.height
        })
      });
    }

    const shouldFlash = info.drawAttention;
    const isDrawingAttention = shouldFlash !== undefined;
    if (isDrawingAttention) {
      surface.drawAttention(shouldFlash);
    }

    const isFocusing = info.focused === true;
    if (isFocusing) {
      surface.focus();
    }

    return this.describe(id);
  }

  /**
   * Closes a window; `onRemoved` fires once it has closed, which a close guard can prevent.
   *
   * @param windowId - An id, or `WINDOW_ID_CURRENT`.
   */
  async remove(windowId: number) {
    this.entryOf(windowId).surface.close();
  }

  private entryOf(windowId: number) {
    const id = windowIdSchema.parse(windowId);
    const isCurrent = id === WINDOW_ID_CURRENT;
    const target = isCurrent ? this.currentOrLastFocusedId() : id;
    const entry = this.entries.get(target);
    const isMissing = entry === undefined;
    if (isMissing) {
      throw new Error(`No window with id: ${id}`);
    }

    return entry;
  }

  private currentOrLastFocusedId() {
    const hasCurrent = this.entries.has(this.currentId);
    return hasCurrent ? this.currentId : this.lastFocusedId;
  }

  private describe(id: number) {
    const entry = this.entries.get(id);
    const isMissing = entry === undefined;
    if (isMissing) {
      throw new Error(`No window with id: ${id}`);
    }

    const { surface } = entry;
    const bounds = surface.bounds();
    return {
      id,
      focused: surface.isFocused(),
      top: bounds.y,
      left: bounds.x,
      width: bounds.width,
      height: bounds.height,
      state: surface.state(),
      alwaysOnTop: surface.isAlwaysOnTop(),
      incognito: false,
      type: WindowType.normal
    } satisfies ChromeWindow;
  }

  private focusChanged({ id, isFocused }: {
    id: number;
    isFocused: boolean;
  }) {
    if (isFocused) {
      this.lastFocusedId = id;
    }

    const isGainingFocus = isFocused && this.focusedId !== id;
    if (isGainingFocus) {
      this.focusedId = id;
      this.onFocusChanged.dispatch(id);
      return;
    }

    const isLosingFocus = !isFocused && this.focusedId === id;
    if (isLosingFocus) {
      this.focusedId = WINDOW_ID_NONE;
      this.onFocusChanged.dispatch(WINDOW_ID_NONE);
    }
  }

  private closed(id: number) {
    const entry = this.entries.get(id);
    const isMissing = entry === undefined;
    if (isMissing) {
      return;
    }

    for (const stop of entry.stops) {
      stop();
    }

    this.entries.delete(id);

    const isFocused = this.focusedId === id;
    if (isFocused) {
      this.focusedId = WINDOW_ID_NONE;
    }

    this.onRemoved.dispatch(id);
  }
}
