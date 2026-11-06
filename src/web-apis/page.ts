import { DomErrorName, domException } from "./dom-exception.ts";
import { HandlerEventTarget } from "./event-handlers.ts";
import { defineProperty } from "./install.ts";
import { launchUri } from "#src/data-transfer/launcher.js";
import { DisplayStatus } from "#src/devices/bindings.js";
import { listenIfAllowed } from "#src/devices/subscription.js";
import { windowsSystemPowerSource } from "#src/devices/system-power.js";
import type { SystemPowerSource } from "#src/devices/system-power.js";
import { ElementNode } from "#src/renderer/tree/dom.js";
import { flush } from "#src/scheduling.js";
import type { WindowHandle } from "#src/window/window-handle.js";
import { AppWindowPresenterKind, OverlappedPresenter, projectAs, WindowActivationState } from "#src/winui.js";

/** The states a window can be in: the web's fullscreen and Picture-in-Picture, and the overlapped window's. */
export const WindowState = {
  NORMAL: "normal",
  MINIMIZED: "minimized",
  MAXIMIZED: "maximized",
  FULLSCREEN: "fullscreen",
  COMPACT_OVERLAY: "compact-overlay"
} as const;
/** One of the values of `WindowState`. */
export type WindowState = (typeof WindowState)[keyof typeof WindowState];

/** What the page API reads of the window, all at once. */
export interface PageSnapshot {
  /** Shown and not minimized. */
  readonly isVisible: boolean;

  /** The display is on or dimmed; false when Windows turned it off, which makes the page `hidden` as well. */
  readonly isDisplayOn: boolean;

  /** How many times the machine has woken from sleep; each wake is a `freeze` and a `resume`. */
  readonly resumeCount: number;

  /** The window is the active one. */
  readonly isFocused: boolean;
  readonly state: WindowState;
  readonly title: string;
  readonly isClosed: boolean;
}

/** What the window tells the page API. */
export interface PageListener {
  /** Something about the window changed: read it again. */
  changed(): void;

  /** The user is closing the window; true keeps it open. */
  closing(): boolean;

  /** The window is gone. */
  closed(): void;
}

/** The window the page API stands for: the real one is a `WindowHandle`, the tests give their own. */
export interface PageBackend {
  read(): PageSnapshot;
  subscribe(listener: PageListener): () => void;
  setState(state: WindowState): void;
  setTitle(title: string): void;
  close(): void;
  open(url: string): void;
}

/** The part of a `WindowHandle` the page API uses: `bind:handle` on `<Window>` gives one. */
export type PageWindow = Pick<WindowHandle, "appWindow" | "close" | "maximize" | "minimize" | "restore" | "window">;

/** What `installPage` takes. */
export interface PageInstallOptions {
  /** The window; default: the one `usePageWindow` was given. */
  readonly backend?: PageBackend;
}

declare global {
  // The window-state extras join the standard document wherever this module is imported.
  interface Document {
    /** Page Lifecycle: the machine woke from sleep (always followed by `onresume`). */
    onfreeze: ((event: Event) => void) | null;

    /** Page Lifecycle: the machine woke from sleep. */
    onresume: ((event: Event) => void) | null;

    /** WinUI only: `normal`, `minimized`, `maximized`, `fullscreen` or `compact-overlay`. */
    readonly windowState?: WindowState;

    /**
     * WinUI only: puts the window in a state, including the compact overlay
     * (a small always-on-top window, Windows' picture in picture).
     */
    requestWindowState?(state: WindowState): Promise<void>;
  }
}

// Microsoft.UI.Windowing.OverlappedPresenterState: Maximized 0, Minimized 1, Restored 2.
const OVERLAPPED_MAXIMIZED = 0;
const OVERLAPPED_MINIMIZED = 1;
const VISIBLE = "visible";
const HIDDEN = "hidden";
const EVENT_VISIBILITY = "visibilitychange";
const EVENT_FREEZE = "freeze";
const EVENT_RESUME = "resume";
const EVENT_FULLSCREEN = "fullscreenchange";
const EVENT_FULLSCREEN_ERROR = "fullscreenerror";
const DOCUMENT_HANDLERS = ["onvisibilitychange", "onfullscreenchange", "onfullscreenerror", "onfreeze", "onresume"] as const;
const WINDOW_HANDLERS = ["onfocus", "onblur", "onbeforeunload", "onpagehide", "onunload"] as const;

/** An event target whose `on...` properties other code can reach. */
class PageEvents extends HandlerEventTarget {
  handlerFor(type: string) {
    return this.getHandler(type);
  }

  assign({ type, handler }: {
    type: string;
    handler: EventListener | null;
  }) {
    this.setHandler({
      type,
      handler
    });
  }
}

interface PageContext {
  readonly backend: PageBackend;
  readonly documentEvents: PageEvents;
  readonly windowEvents: PageEvents;
  snapshot: PageSnapshot;
  fullscreenElement: object | null;
}

let context: PageContext | undefined;
let defaultBackend: WindowPageBackend | undefined;

function requireContext() {
  if (!context) {
    throw domException({
      name: DomErrorName.INVALID_STATE,
      message: "The page is not installed: call installPage() first"
    });
  }

  return context;
}

function stateOf(handle: PageWindow) {
  const { presenter } = handle.appWindow;
  const isOverlapped = presenter.kind === AppWindowPresenterKind.Overlapped;
  if (!isOverlapped) {
    return presenter.kind === AppWindowPresenterKind.FullScreen ? WindowState.FULLSCREEN : WindowState.COMPACT_OVERLAY;
  }

  const overlapped = projectAs(presenter, OverlappedPresenter);
  const isMinimized = overlapped.state === OVERLAPPED_MINIMIZED;
  if (isMinimized) {
    return WindowState.MINIMIZED;
  }

  const isMaximized = overlapped.state === OVERLAPPED_MAXIMIZED;
  return isMaximized ? WindowState.MAXIMIZED : WindowState.NORMAL;
}

const PRESENTER_KINDS = new Map<WindowState, AppWindowPresenterKind>([
  [WindowState.FULLSCREEN, AppWindowPresenterKind.FullScreen],
  [WindowState.COMPACT_OVERLAY, AppWindowPresenterKind.CompactOverlay]
]);

/** The page API over a real window: the Window, its AppWindow and presenters. */
export class WindowPageBackend implements PageBackend {
  private handle: PageWindow | null = null;
  private isFocused = false;
  private isClosed = false;
  private readonly listeners = new Set<PageListener>();
  private stops: Array<() => void> = [];
  private readonly power: SystemPowerSource;

  constructor(power: SystemPowerSource = windowsSystemPowerSource()) {
    this.power = power;
  }

  /** Follows this window from now on; returns what stops following it. */
  attach(handle: PageWindow) {
    this.detach();
    this.handle = handle;
    this.isClosed = false;
    const { window, appWindow } = handle;
    this.stops = [
      window.onActivated((_sender, args) => {
        this.isFocused = args.windowActivationState !== WindowActivationState.Deactivated;
        this.notifyChanged();
      }),
      window.onVisibilityChanged(() => this.notifyChanged()),
      appWindow.onChanged(() => this.notifyChanged()),
      appWindow.onClosing((_sender, args) => {
        const isKeptOpen = [...this.listeners].some(listener => listener.closing());
        if (isKeptOpen) {
          args.cancel = true;
        }
      }),
      window.onClosed(() => {
        this.isClosed = true;
        for (const listener of this.listeners) {
          listener.closed();
        }
      }),
      ...this.power.subscriptions.map(subscription => listenIfAllowed({
        subscription,
        notify: () => this.notifyChanged()
      }))
    ];
    this.notifyChanged();
    return () => this.detach();
  }

  read() {
    const { handle } = this;
    const isOpen = handle !== null && !this.isClosed;
    if (!isOpen) {
      return {
        isVisible: false,
        isDisplayOn: true,
        resumeCount: 0,
        isFocused: false,
        state: WindowState.NORMAL,
        title: "",
        isClosed: this.isClosed
      };
    }

    const state = stateOf(handle);
    const { displayStatus, resumeCount } = this.readPower();
    return {
      isVisible: handle.appWindow.isVisible && state !== WindowState.MINIMIZED,
      isDisplayOn: displayStatus !== DisplayStatus.Off,
      resumeCount,
      isFocused: this.isFocused,
      state,
      title: handle.appWindow.title,
      isClosed: false
    };
  }

  subscribe(listener: PageListener) {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  setState(state: WindowState) {
    const { handle } = this;
    const isDetached = handle === null;
    if (isDetached) {
      return;
    }

    const kind = PRESENTER_KINDS.get(state);
    const isPresenterState = kind !== undefined;
    if (isPresenterState) {
      handle.appWindow.setPresenterByKind(kind);
      return;
    }

    const isOverlapped = handle.appWindow.presenter.kind === AppWindowPresenterKind.Overlapped;
    if (!isOverlapped) {
      handle.appWindow.setPresenterByKind(AppWindowPresenterKind.Overlapped);
    }

    this.applyOverlapped({
      handle,
      state
    });
  }

  setTitle(title: string) {
    const { handle } = this;
    const isAttached = handle !== null;
    if (isAttached) {
      handle.appWindow.title = title;
    }
  }

  close() {
    this.handle?.close();
  }

  open(url: string) {
    void launchUri(url);
  }

  private applyOverlapped({ handle, state }: {
    handle: PageWindow;
    state: WindowState;
  }) {
    const isMinimized = state === WindowState.MINIMIZED;
    if (isMinimized) {
      handle.minimize();
      return;
    }

    const isMaximized = state === WindowState.MAXIMIZED;
    if (isMaximized) {
      handle.maximize();
      return;
    }

    handle.restore();
  }

  // A machine whose session power state cannot be read is taken as awake with its display on.
  private readPower() {
    try {
      return this.power.read();
    } catch {
      return {
        displayStatus: DisplayStatus.On,
        resumeCount: 0
      };
    }
  }

  private notifyChanged() {
    for (const listener of this.listeners) {
      listener.changed();
    }

    flush();
  }

  private detach() {
    for (const stop of this.stops) {
      stop();
    }

    this.stops = [];
    this.handle = null;
  }
}

/**
 * Tells the installed page API which window it is: call it with the handle
 * `bind:handle` gives on `<Window>`. A page has one window; calling it again
 * switches to the new one.
 *
 * @param handle - The window the page's visibility, focus, fullscreen and title are about.
 * @returns A function that stops following the window.
 * @throws {DOMException} When `installPage` has not run, or was given its own backend.
 */
export function usePageWindow(handle: PageWindow) {
  requireContext();

  if (!defaultBackend) {
    throw domException({
      name: DomErrorName.INVALID_STATE,
      message: "The page API was installed with a backend of its own: it has no window to follow"
    });
  }

  return defaultBackend.attach(handle);
}

function dispatchOn({ target, type }: {
  target: EventTarget;
  type: string;
}) {
  target.dispatchEvent(new Event(type));
}

// Hidden for the page API also means the display is off.
function isPageVisible(snapshot: PageSnapshot) {
  return snapshot.isVisible && snapshot.isDisplayOn;
}

function refresh() {
  const known = requireContext();
  const previous = known.snapshot;
  const next = known.backend.read();
  known.snapshot = next;
  const hasBeenFullscreen = previous.state === WindowState.FULLSCREEN;
  const isFullscreen = next.state === WindowState.FULLSCREEN;
  const hasLeftFullscreen = hasBeenFullscreen && !isFullscreen;
  if (hasLeftFullscreen) {
    known.fullscreenElement = null;
  }

  const isVisibilityChanged = isPageVisible(previous) !== isPageVisible(next);
  if (isVisibilityChanged) {
    dispatchOn({
      target: known.documentEvents,
      type: EVENT_VISIBILITY
    });
  }

  const hasResumed = next.resumeCount > previous.resumeCount;
  if (hasResumed) {
    // A sleep stops the process, so the wake is all that is seen of it: the pair arrives together.
    for (const type of [EVENT_FREEZE, EVENT_RESUME]) {
      dispatchOn({
        target: known.documentEvents,
        type
      });
    }
  }

  const isFullscreenChanged = hasBeenFullscreen !== isFullscreen;
  if (isFullscreenChanged) {
    dispatchOn({
      target: known.documentEvents,
      type: EVENT_FULLSCREEN
    });
  }

  const isFocusChanged = previous.isFocused !== next.isFocused;
  if (isFocusChanged) {
    dispatchOn({
      target: known.windowEvents,
      type: next.isFocused ? "focus" : "blur"
    });
  }
}

function closing() {
  const event = new Event("beforeunload", { cancelable: true });
  requireContext().windowEvents.dispatchEvent(event);
  return event.defaultPrevented;
}

function closed() {
  const { windowEvents } = requireContext();
  dispatchOn({
    target: windowEvents,
    type: "pagehide"
  });
  dispatchOn({
    target: windowEvents,
    type: "unload"
  });
}

function setWindowState(state: WindowState) {
  const known = requireContext();
  known.backend.setState(state);
  refresh();
  const isReached = known.snapshot.state === state;
  if (isReached) {
    return Promise.resolve();
  }

  dispatchOn({
    target: known.documentEvents,
    type: EVENT_FULLSCREEN_ERROR
  });
  return Promise.reject(new TypeError(`The window could not change to ${state}`));
}

function requestFullscreen(element: object) {
  const known = requireContext();
  known.fullscreenElement = element;
  const isFullscreen = known.snapshot.state === WindowState.FULLSCREEN;
  if (isFullscreen) {
    return Promise.resolve();
  }

  return setWindowState(WindowState.FULLSCREEN).catch((error: unknown) => {
    known.fullscreenElement = null;
    throw error;
  });
}

function exitFullscreen() {
  const isFullscreen = requireContext().snapshot.state === WindowState.FULLSCREEN;
  if (!isFullscreen) {
    return Promise.reject(new TypeError("The document is not in fullscreen"));
  }

  return setWindowState(WindowState.NORMAL);
}

function accessorsFor({ events, names }: {
  events: PageEvents;
  names: readonly string[];
}) {
  return Object.fromEntries(
    names.map(name => [name, {
      get: () => events.handlerFor(name.slice("on".length)),
      set: (handler: EventListener | null) => events.assign({
        type: name.slice("on".length),
        handler
      }),
      configurable: true
    }])
  );
}

function eventMethods(events: PageEvents) {
  return {
    addEventListener: {
      value: events.addEventListener.bind(events)
    },
    removeEventListener: {
      value: events.removeEventListener.bind(events)
    },
    dispatchEvent: {
      value: events.dispatchEvent.bind(events)
    }
  };
}

function documentMembers(known: PageContext) {
  return {
    ...eventMethods(known.documentEvents),
    ...accessorsFor({
      events: known.documentEvents,
      names: DOCUMENT_HANDLERS
    }),
    visibilityState: {
      get: () => isPageVisible(known.snapshot) ? VISIBLE : HIDDEN
    },
    hidden: {
      get: () => !isPageVisible(known.snapshot)
    },
    hasFocus: {
      value: () => known.snapshot.isFocused
    },
    fullscreenEnabled: {
      value: true
    },
    fullscreenElement: {
      get: () => known.fullscreenElement
    },
    exitFullscreen: {
      value: exitFullscreen
    },
    title: {
      get: () => known.snapshot.title,
      set(title: string) {
        known.backend.setTitle(title);
        refresh();
      }
    },
    windowState: {
      get: () => known.snapshot.state
    },
    requestWindowState: {
      value: setWindowState
    }
  } satisfies PropertyDescriptorMap;
}

function windowMembers(known: PageContext) {
  return {
    ...eventMethods(known.windowEvents),
    ...accessorsFor({
      events: known.windowEvents,
      names: WINDOW_HANDLERS
    }),
    closed: {
      get: () => known.snapshot.isClosed
    },
    close: {
      value: () => known.backend.close()
    },
    open: {
      value(url?: string | URL) {
        const isAddress = url !== undefined && String(url) !== "";
        if (isAddress) {
          known.backend.open(String(url));
        }

        return null;
      }
    }
  } satisfies PropertyDescriptorMap;
}

function defineMembers({ target, members }: {
  target: object;
  members: PropertyDescriptorMap;
}) {
  const names = Object.keys(members);
  const previous = names.map(name => [name, Object.getOwnPropertyDescriptor(target, name)] as const);
  Object.defineProperties(
    target, Object.fromEntries(
      Object.entries(members).map(([name, descriptor]) => [name, {
        configurable: true,
        ...descriptor
      }])
    )
  );
  return () => {
    for (const [name, descriptor] of previous) {
      const isNew = descriptor === undefined;
      if (isNew) {
        // eslint-disable-next-line no-restricted-syntax -- the one typed way to delete a property of any object
        Reflect.deleteProperty(target, name);
      } else {
        Object.defineProperty(target, name, descriptor);
      }
    }
  };
}

/**
 * Defines the page on the global scope: `document.visibilityState`, `hidden`,
 * `hasFocus()`, `visibilitychange`; the Page Lifecycle `freeze` and `resume` on
 * `document`, together, once per wake of the machine from sleep; the Fullscreen
 * API (`element.requestFullscreen()`, `document.fullscreenElement`,
 * `exitFullscreen()`, `fullscreenchange`); `document.title`;
 * `window` events (`focus`, `blur`, `beforeunload`, `pagehide`, `unload`),
 * `window.close()` and `window.open(url)` (hands the address to Windows; there is
 * no second window to return). The window is the one `usePageWindow` was given.
 * Hidden means minimized, hidden (to the tray) or the display turned off; fullscreen takes the whole
 * window, whatever element asked. A `beforeunload` listener keeps the window
 * open by calling `preventDefault()`, with no prompt. Beyond the web:
 * `document.windowState` and `document.requestWindowState(state)`, which also
 * reach the compact overlay.
 *
 * @param options - A window of your own, for a test.
 * @returns A function that removes the page again.
 */
export function installPage(options: PageInstallOptions = {}) {
  const windowBackend = new WindowPageBackend();
  const backend = options.backend ?? windowBackend;
  defaultBackend = options.backend === undefined ? windowBackend : undefined;
  const known: PageContext = {
    backend,
    documentEvents: new PageEvents(),
    windowEvents: new PageEvents(),
    snapshot: backend.read(),
    fullscreenElement: null
  };
  context = known;
  const stopListening = backend.subscribe({
    changed: refresh,
    closing,
    closed
  });
  const pageDocument = {};
  const hasDocument = typeof globalThis.document === "object";
  const target = hasDocument ? globalThis.document : pageDocument;
  const restores = [
    defineMembers({
      target,
      members: documentMembers(known)
    }),
    defineMembers({
      target: globalThis,
      members: windowMembers(known)
    }),
    defineProperty({
      name: "requestFullscreen",
      target: ElementNode.prototype,
      value(this: object) {
        return requestFullscreen(this);
      }
    })
  ];
  if (!hasDocument) {
    Object.defineProperty(globalThis, "document", {
      value: pageDocument,
      configurable: true,
      writable: true
    });
  }

  return () => {
    stopListening();
    for (const restore of restores.reverse()) {
      restore();
    }

    const isOurDocument = !hasDocument && globalThis.document === pageDocument;
    if (isOurDocument) {
      // eslint-disable-next-line no-restricted-syntax -- the one typed way to delete a property of any object
      Reflect.deleteProperty(globalThis, "document");
    }

    context = undefined;
    defaultBackend = undefined;
  };
}
