import type { AppWindow, Window } from "#src/winui.js";

type ArgumentsOf<Subscribe extends (callback: never) => unknown> = Parameters<Parameters<Subscribe>[0]>[1];

/**
 * The events of a window, each named as the Windows App SDK names it, in lower
 * case, with the arguments the SDK reports: `activated`, `sizechanged`,
 * `visibilitychanged` and `closed` are `Window`'s, `changed`, `closing` and
 * `destroying` are `AppWindow`'s.
 */
export interface WindowEventArguments {
  readonly activated: ArgumentsOf<Window["onActivated"]>;
  readonly sizechanged: ArgumentsOf<Window["onSizeChanged"]>;
  readonly visibilitychanged: ArgumentsOf<Window["onVisibilityChanged"]>;
  readonly closed: ArgumentsOf<Window["onClosed"]>;
  readonly changed: ArgumentsOf<AppWindow["onChanged"]>;
  /** Only `cancel`, which is all the SDK's arguments have, so that `close()` can ask too. */
  readonly closing: Pick<ArgumentsOf<AppWindow["onClosing"]>, "cancel">;
  readonly destroying: ArgumentsOf<AppWindow["onDestroying"]>;
}

/** The names of the window events. */
export const WindowEventType = {
  ACTIVATED: "activated",
  SIZE_CHANGED: "sizechanged",
  VISIBILITY_CHANGED: "visibilitychanged",
  CLOSED: "closed",
  CHANGED: "changed",
  CLOSING: "closing",
  DESTROYING: "destroying"
} as const;

/** The name of a window event. */
export type WindowEventType = typeof WindowEventType[keyof typeof WindowEventType];

/**
 * A window event as the DOM has events: `args` are the SDK's arguments. On
 * `closing`, `preventDefault()` keeps the window open, as `args.cancel` does.
 */
export class WindowEvent<Type extends WindowEventType = WindowEventType> extends Event {
  /** The arguments the Windows App SDK passed. */
  readonly args: WindowEventArguments[Type];

  constructor({ type, args }: {
    type: Type;
    args: WindowEventArguments[Type];
  }) {
    super(type, { cancelable: type === WindowEventType.CLOSING });
    this.args = args;
  }
}

/** A listener of one window event. */
export type WindowEventListener<Type extends WindowEventType> = (event: WindowEvent<Type>) => void;

// What the two overloads of a listener method take: a DOM listener, or one that asks for a window event.
type AnyListener = EventListenerOrEventListenerObject | ((event: never) => void);

// Every listener is a DOM one to EventTarget: a window listener only narrows the event it is given.
function isDomListener(listener: AnyListener): listener is EventListenerOrEventListenerObject {
  return typeof listener === "function" || "handleEvent" in listener;
}

type Dispatch<Type extends WindowEventType> = (args: WindowEventArguments[Type]) => WindowEvent<Type>;

type Subscriptions = {
  readonly [Type in WindowEventType]: (dispatch: Dispatch<Type>) => void;
};

function subscriptionsOf(window: Window) {
  return {
    activated: dispatch => window.onActivated((_sender, args) => dispatch(args)),
    sizechanged: dispatch => window.onSizeChanged((_sender, args) => dispatch(args)),
    visibilitychanged: dispatch => window.onVisibilityChanged((_sender, args) => dispatch(args)),
    closed: dispatch => window.onClosed((_sender, args) => dispatch(args)),
    changed: dispatch => window.appWindow.onChanged((_sender, args) => dispatch(args)),
    // Only ever set: the window's own `onclosing` may have refused the close already.
    closing: dispatch => window.appWindow.onClosing((_sender, args) => {
      const event = dispatch(args);
      if (event.defaultPrevented) {
        args.cancel = true;
      }
    }),
    destroying: dispatch => window.appWindow.onDestroying((_sender, args) => dispatch(args))
  } satisfies Subscriptions;
}

const EVENT_TYPES: ReadonlySet<string> = new Set(Object.values(WindowEventType));

function isWindowEventType(type: string): type is WindowEventType {
  return EVENT_TYPES.has(type);
}

/**
 * A window's events through `addEventListener` and `removeEventListener`, with
 * `once` and `signal` as in a browser. The native event is subscribed when its
 * first listener is added.
 */
export class WindowEventTarget extends EventTarget {
  /** The native WinUI window. */
  readonly window: Window;
  private readonly subscribed = new Set<string>();

  constructor(window: Window) {
    super();
    this.window = window;
  }

  override addEventListener<Type extends WindowEventType>(
    type: Type,
    listener: WindowEventListener<Type>,
    options?: AddEventListenerOptions | boolean
  ): void;
  override addEventListener(
    type: string,
    listener: EventListenerOrEventListenerObject,
    options?: AddEventListenerOptions | boolean
  ): void;
  override addEventListener(
    type: string,
    listener: AnyListener,
    options?: AddEventListenerOptions | boolean
  ) {
    this.subscribe(type);

    if (isDomListener(listener)) {
      super.addEventListener(type, listener, options);
    }
  }

  override removeEventListener<Type extends WindowEventType>(
    type: Type,
    listener: WindowEventListener<Type>,
    options?: EventListenerOptions | boolean
  ): void;
  override removeEventListener(
    type: string,
    listener: EventListenerOrEventListenerObject,
    options?: EventListenerOptions | boolean
  ): void;
  override removeEventListener(
    type: string,
    listener: AnyListener,
    options?: EventListenerOptions | boolean
  ) {
    if (isDomListener(listener)) {
      super.removeEventListener(type, listener, options);
    }
  }

  private subscribe(type: string) {
    const isDone = this.subscribed.has(type);
    if (isDone) {
      return;
    }

    if (isWindowEventType(type)) {
      this.subscribed.add(type);
      this.listenTo({
        type,
        subscriptions: subscriptionsOf(this.window)
      });
    }
  }

  private listenTo<Type extends WindowEventType>({ type, subscriptions }: {
    type: Type;
    subscriptions: Subscriptions;
  }) {
    subscriptions[type](args => {
      const event = new WindowEvent({
        type,
        args
      });
      this.dispatchEvent(event);
      return event;
    });
  }
}
