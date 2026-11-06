import { DomErrorName, domException } from "./dom-exception.ts";
import { HandlerEventTarget } from "./event-handlers.ts";
import { defineProperty } from "./install.ts";
import { announcePermissionChange, PermissionName, PermissionStateName, registerPermission } from "./permissions.ts";
import { windowsNotificationSource } from "#src/app/notification-source.js";
import { notifierState, registerNotifier, scheduleNotification, showNotification } from "#src/app/notify.js";
import type {
  NotificationBackend,
  NotificationButtonStyle,
  NotificationChoice,
  NotificationControl,
  NotificationIdentity,
  NotificationInvocation,
  NotificationProgress,
  NotificationScenario,
  NotificationSound
} from "#src/app/notify.js";
import { joinAppUserModel } from "#src/window/native.js";
import path from "node:path";
import { pathToFileURL } from "node:url";

const TOKEN_ARGUMENT = "webNotification";
const ACTION_ARGUMENT = "action";
const DEFAULT_GROUP = "web";
const MAX_ACTIONS = 5;
const ADDRESS_PATTERN = /^(?:https?|file|ms-appx|ms-appdata):/iu;

/** The three values of `Notification.permission`. */
export const NotificationPermission = {
  DEFAULT: "default",
  GRANTED: "granted",
  DENIED: "denied"
} as const;
/** One of the values of `NotificationPermission`. */
export type NotificationPermission = (typeof NotificationPermission)[keyof typeof NotificationPermission];

/** When a scheduled notification shows: milliseconds since 1970, as `Date.now()` counts. */
export class TimestampTrigger {
  readonly timestamp: number;

  constructor(timestamp: number) {
    this.timestamp = timestamp;
  }
}

/** A button of the standard `actions` list. */
export interface NotificationAction {
  readonly action: string;
  readonly title: string;
  readonly icon?: string;
}

/**
 * A control beyond the standard `actions`: a button with a style, a text box
 * or a selection. WinUI-only; a browser ignores the option.
 */
export type NotificationButton =
  | {
    readonly type?: "button";
    readonly action: string;
    readonly title: string;
    readonly style?: NotificationButtonStyle;
    readonly tooltip?: string;
    readonly icon?: string;

    /** The `id` of a `text-input` or `selection`; the button then sends what it holds. */
    readonly inputId?: string;
  }
  | {
    readonly type: "text-input";
    readonly id: string;
    readonly placeholder?: string;
    readonly title?: string;
  }
  | {
    readonly type: "selection";
    readonly id: string;
    readonly title?: string;
    readonly items: readonly NotificationChoice[];
    readonly selectedItem?: string;
  };

/**
 * What Windows adds to the standard `NotificationOptions`. Every member is
 * optional and a browser ignores it; the standard behaviour is the same when
 * none is given. They autocomplete only where this module is imported.
 */
export interface NotificationExtras {
  /** Controls beyond `actions`; all of them come after the `actions` buttons. */
  readonly buttons?: readonly NotificationButton[];

  /** A progress bar; change it later with `notification.update`. Needs a tag, which is made up when you give none. */
  readonly progress?: NotificationProgress;

  /** How urgent it is; `requireInteraction` alone means `reminder`. */
  readonly scenario?: NotificationScenario;

  /** When Windows removes it from the notification center, as a `Date` or milliseconds since 1970. */
  readonly expiration?: Date | number;

  /** With `tag`, the collection a notification replaces within; `web` by default. */
  readonly group?: string;

  /** A wide picture across the top; `image` is the one inside. */
  readonly hero?: string;

  /** A system sound; `silent: true` wins. */
  readonly audio?: NotificationSound;

  /** Small text naming the source, at the bottom. */
  readonly attribution?: string;

  /**
   * Shows the notification at a moment, even if the app has exited by then
   * (`new TimestampTrigger(Date.now() + 60_000)`). Only a process with package
   * identity can schedule; without it the constructor throws `NotSupportedError`.
   */
  readonly showTrigger?: TimestampTrigger;
}

/** The standard options of `new Notification(title, options)`, with the extras. */
export interface NotificationInit extends NotificationExtras {
  readonly body?: string;
  readonly tag?: string;
  readonly icon?: string;
  readonly image?: string;
  readonly badge?: string;
  readonly data?: unknown;
  readonly dir?: "auto" | "ltr" | "rtl";
  readonly lang?: string;
  readonly renotify?: boolean;
  readonly silent?: boolean | null;
  readonly requireInteraction?: boolean;
  readonly timestamp?: number;
  readonly vibrate?: number | readonly number[];
  readonly actions?: readonly NotificationAction[];
}

declare global {
  // The extras join the standard options wherever this module is imported.
  // eslint-disable-next-line @typescript-eslint/no-empty-object-type -- declaration merging is the point
  interface NotificationOptions extends NotificationExtras {}
}

/** What `installNotification` takes. */
export interface NotificationInstallOptions {
  /** The name and icon file Windows shows for an unpackaged app; both or none. */
  readonly identity?: NotificationIdentity;

  /** The id `runWindow` and the window take, so the app's toasts are not Node's. */
  readonly appUserModelId?: string;

  /** Stands in for the Windows App SDK; the tests give one. */
  readonly backend?: NotificationBackend;

  /** The registration state to share with `notify`; the tests give their own. */
  readonly state?: { isRegistered: boolean };
}

interface NotificationContext {
  readonly backend: NotificationBackend;
  readonly state: { isRegistered: boolean };
  readonly identity: Partial<NotificationIdentity>;
  readonly appUserModelId: string | undefined;
  readonly live: Map<string, Notification>;
  readonly byTag: Map<string, Notification>;
  permission: NotificationPermission;
  nextToken: number;
}

let context: NotificationContext | undefined;

function requireContext() {
  if (!context) {
    throw domException({
      name: DomErrorName.INVALID_STATE,
      message: "Notification is not installed: call installNotification() first"
    });
  }

  return context;
}

function addressOf(reference: string) {
  const isAddress = ADDRESS_PATTERN.test(reference);
  return isAddress ? reference : pathToFileURL(path.resolve(reference)).href;
}

function optionalAddress(reference: string | undefined) {
  const isGiven = reference !== undefined && reference !== "";
  return isGiven ? { value: addressOf(reference) } : undefined;
}

function withStandardDefaults(options: NotificationInit) {
  return {
    body: options.body ?? "",
    tag: options.tag ?? "",
    icon: options.icon ?? "",
    image: options.image ?? "",
    badge: options.badge ?? "",
    data: options.data ?? null,
    dir: options.dir ?? "auto",
    lang: options.lang ?? "",
    renotify: options.renotify ?? false,
    silent: options.silent ?? null,
    requireInteraction: options.requireInteraction ?? false,
    timestamp: options.timestamp ?? Date.now(),
    vibrate: [options.vibrate ?? []].flat(),
    actions: options.actions?.slice(0, MAX_ACTIONS) ?? []
  };
}

function iconField(reference: string | undefined) {
  const address = optionalAddress(reference);
  return address === undefined ? {} : { iconUri: address.value };
}

function millisecondsOf(moment: Date | number) {
  return moment instanceof Date ? moment.getTime() : moment;
}

function currentPermission(known: NotificationContext) {
  const isRegisteredElsewhere = known.permission === NotificationPermission.DEFAULT && known.state.isRegistered;
  return isRegisteredElsewhere ? NotificationPermission.GRANTED : known.permission;
}

async function resolvePermission(known: NotificationContext) {
  const current = currentPermission(known);
  const isDecided = current !== NotificationPermission.DEFAULT;
  if (isDecided) {
    return current;
  }

  const { backend } = known;
  const isUsable = backend.isSupported() && backend.isEnabled();
  known.permission = NotificationPermission.DENIED;

  if (isUsable) {
    try {
      const { appUserModelId } = known;
      const isNamed = appUserModelId !== undefined;
      if (isNamed) {
        joinAppUserModel(appUserModelId);
      }

      registerNotifier({
        source: backend,
        state: known.state,
        identity: known.identity,
        onInvoked: invocation => routeActivation({
          known,
          invocation
        })
      });
      known.permission = NotificationPermission.GRANTED;
    } catch {
      known.permission = NotificationPermission.DENIED;
    }
  }

  announcePermissionChange(PermissionName.NOTIFICATIONS);
  return known.permission;
}

function routeActivation({ known, invocation }: {
  known: NotificationContext;
  invocation: NotificationInvocation;
}) {
  const token = invocation.arguments.get(TOKEN_ARGUMENT);
  const notification = token === undefined ? undefined : known.live.get(token);
  const isUnknown = notification === undefined;
  if (isUnknown) {
    return;
  }

  const encodedAction = invocation.arguments.get(ACTION_ARGUMENT) ?? "";
  notification.activate({
    action: decodeURIComponent(encodedAction),
    readInput: invocation.readInput
  });
}

/** A `click` on a notification or one of its buttons. */
export class NotificationClickEvent extends Event {
  /** The notification that was clicked. */
  readonly notification: Notification;

  /** The `action` of the button that was clicked, or an empty string for the notification itself. WinUI-only. */
  readonly action: string;

  /** What the user typed or chose, by input `id`. WinUI-only; empty without inputs. */
  readonly userInput: Readonly<Record<string, string>>;

  constructor(type: string, init: {
    notification: Notification;
    action: string;
    userInput: Readonly<Record<string, string>>;
  }) {
    super(type);
    this.notification = init.notification;
    this.action = init.action;
    this.userInput = init.userInput;
  }
}

/**
 * The web `Notification` over Windows app notifications. Events are
 * `show`, `click`, `close` and `error`. Windows reports no dismissal by the
 * user, so `close` fires for `close()` and for a replacement by `tag` only.
 */
export class Notification extends HandlerEventTarget {
  /** How many buttons are shown. */
  static readonly maxActions = MAX_ACTIONS;

  readonly title: string;
  readonly body: string;
  readonly tag: string;
  readonly icon: string;
  readonly image: string;
  readonly badge: string;
  readonly data: unknown;
  readonly dir: "auto" | "ltr" | "rtl";
  readonly lang: string;
  // eslint-disable-next-line @typescript-eslint/naming-convention -- the standard member name
  readonly renotify: boolean;
  // eslint-disable-next-line @typescript-eslint/naming-convention -- the standard member name
  readonly silent: boolean | null;
  // eslint-disable-next-line @typescript-eslint/naming-convention -- the standard member name
  readonly requireInteraction: boolean;
  readonly timestamp: number;
  readonly vibrate: readonly number[];
  readonly actions: readonly NotificationAction[];
  readonly buttons: readonly NotificationButton[];
  readonly scenario: NotificationScenario | undefined;
  readonly group: string;
  private readonly known: NotificationContext;
  private readonly token: string;
  private readonly wireTag: string;
  private readonly extras: NotificationExtras;
  private currentProgress: NotificationProgress | undefined;
  private sequence = 1;
  private platformId: number | undefined;
  private scheduled: { cancel(): void } | undefined;
  private isClosed = false;

  /**
   * Shows a notification once the permission is granted; before that an
   * `error` event fires. Ask with `Notification.requestPermission()` first.
   *
   * @param title - The first line.
   * @param options - The standard options and the WinUI extras.
   * @throws {TypeError} When `renotify` is set without a `tag`.
   */
  constructor(title: string, options: NotificationInit = {}) {
    super();
    this.known = requireContext();
    const { known } = this;
    this.token = String(known.nextToken);
    known.nextToken += 1;
    const standard = withStandardDefaults(options);
    this.title = title;
    this.body = standard.body;
    this.tag = standard.tag;
    this.icon = standard.icon;
    this.image = standard.image;
    this.badge = standard.badge;
    this.data = standard.data;
    this.dir = standard.dir;
    this.lang = standard.lang;
    this.renotify = standard.renotify;
    this.silent = standard.silent;
    this.requireInteraction = standard.requireInteraction;
    this.timestamp = standard.timestamp;
    this.vibrate = standard.vibrate;
    this.actions = standard.actions;
    this.buttons = options.buttons ?? [];
    this.group = options.group ?? DEFAULT_GROUP;
    this.scenario = options.scenario ?? (this.requireInteraction ? "reminder" : undefined);
    this.extras = options;
    this.currentProgress = options.progress;
    this.wireTag = this.tag === "" ? `web-${this.token}` : this.tag;
    const isRenotifyWithoutTag = this.renotify && this.tag === "";
    if (isRenotifyWithoutTag) {
      throw new TypeError("Notification: renotify requires a tag");
    }

    const isUnschedulable = options.showTrigger !== undefined && !known.backend.canSchedule();
    if (isUnschedulable) {
      throw domException({
        name: DomErrorName.NOT_SUPPORTED,
        message: "Notification: showTrigger needs a process with package identity"
      });
    }

    known.live.set(this.token, this);
    queueMicrotask(() => this.present());
  }

  /** The permission: `default` until `requestPermission`, then `granted` or `denied`. */
  static get permission() {
    return currentPermission(requireContext());
  }

  /**
   * Asks for the right to show notifications: registers the app with Windows
   * and reports `granted`, or `denied` when Windows refuses (notifications
   * unsupported for the process, switched off by the user or policy, or an
   * unpackaged app without an identity).
   *
   * @param callback - The old callback form; the promise is the current one.
   * @returns The permission.
   */
  static async requestPermission(callback?: (permission: NotificationPermission) => void) {
    const permission = await resolvePermission(requireContext());
    callback?.(permission);
    return permission;
  }

  /**
   * Removes every notification of this app from the screen and the
   * notification center, including ones an earlier run showed, and fires
   * `close` on those this run still holds. WinUI-only.
   */
  static async closeAll() {
    const known = requireContext();
    for (const notification of known.live.values()) {
      notification.close();
    }

    await known.backend.removeAll();
  }

  get onclick() {
    return this.getHandler("click");
  }

  set onclick(handler: EventListener | null) {
    this.setHandler({
      type: "click",
      handler
    });
  }

  get onshow() {
    return this.getHandler("show");
  }

  set onshow(handler: EventListener | null) {
    this.setHandler({
      type: "show",
      handler
    });
  }

  get onclose() {
    return this.getHandler("close");
  }

  set onclose(handler: EventListener | null) {
    this.setHandler({
      type: "close",
      handler
    });
  }

  get onerror() {
    return this.getHandler("error");
  }

  set onerror(handler: EventListener | null) {
    this.setHandler({
      type: "error",
      handler
    });
  }

  /** The progress bar as it stands now, if the notification has one. */
  get progress() {
    return this.currentProgress;
  }

  get [Symbol.toStringTag]() {
    return "Notification";
  }

  /** Removes the notification from the screen and the notification center, then fires `close`. */
  close() {
    if (this.isClosed) {
      return;
    }

    this.isClosed = true;
    this.forget();
    this.scheduled?.cancel();
    const { platformId } = this;
    const hasPlatformId = platformId !== undefined;
    if (hasPlatformId) {
      this.known.backend.remove(platformId).catch(() => undefined);
    }

    queueMicrotask(() => this.dispatchEvent(new Event("close")));
  }

  /**
   * Changes the progress bar in place, without showing the notification again.
   * WinUI-only; needs the notification to have been made with `progress`.
   *
   * @param changes - The fields of the bar to change.
   * @throws {DOMException} `InvalidStateError` without a bar or when closed, `NotFoundError` when Windows lost it.
   */
  async update(changes: { progress: NotificationProgress }) {
    const isUpdatable = this.currentProgress !== undefined && !this.isClosed;
    if (!isUpdatable) {
      throw domException({
        name: DomErrorName.INVALID_STATE,
        message: "Notification.update needs an open notification made with progress"
      });
    }

    const merged = {
      ...this.currentProgress,
      ...changes.progress
    };
    this.sequence += 1;
    const isFound = await this.known.backend.updateProgress({
      tag: this.wireTag,
      group: this.group,
      sequence: this.sequence,
      progress: merged
    });
    if (!isFound) {
      throw domException({
        name: DomErrorName.NOT_FOUND,
        message: "Windows no longer has this notification"
      });
    }

    this.currentProgress = merged;
  }

  /** Whether Windows still holds this notification, given the ids it listed; not for apps. */
  isListedIn(ids: ReadonlySet<number>) {
    const { platformId } = this;
    return platformId !== undefined && ids.has(platformId);
  }

  /** Called with a click on the notification; not for apps. */
  activate({ action, readInput }: {
    action: string;
    readInput: (id: string) => string | undefined;
  }) {
    const userInput: Record<string, string> = {};
    for (const id of this.inputIds()) {
      const value = readInput(id);
      const hasValue = value !== undefined;
      if (hasValue) {
        userInput[id] = value;
      }
    }

    this.isClosed = true;
    this.forget();
    this.dispatchEvent(
      new NotificationClickEvent("click", {
        notification: this,
        action,
        userInput
      })
    );
  }

  private inputIds() {
    return this.buttons.flatMap(button => {
      const hasInput = button.type === "text-input" || button.type === "selection";
      return hasInput ? [button.id] : [];
    });
  }

  private forget() {
    const { known } = this;
    known.live.delete(this.token);
    const isCurrent = this.tag !== "" && known.byTag.get(this.tagKey()) === this;
    if (isCurrent) {
      known.byTag.delete(this.tagKey());
    }
  }

  private tagKey() {
    return `${this.group}/${this.tag}`;
  }

  private argumentsFor(action: string | undefined) {
    const pairs = new Map([[TOKEN_ARGUMENT, this.token]]);
    const hasAction = action !== undefined;
    if (hasAction) {
      pairs.set(ACTION_ARGUMENT, encodeURIComponent(action));
    }

    return pairs;
  }

  private controls() {
    const standard = this.actions.map<NotificationControl>(item => ({
      kind: "button",
      title: item.title,
      arguments: this.argumentsFor(item.action),
      ...iconField(item.icon)
    }));
    const extra = this.buttons.map<NotificationControl>(button => {
      const isTextInput = button.type === "text-input";
      if (isTextInput) {
        return {
          kind: "text-input",
          id: button.id,
          ...button.placeholder === undefined ? {} : { placeholder: button.placeholder },
          ...button.title === undefined ? {} : { title: button.title }
        };
      }

      const isSelection = button.type === "selection";
      if (isSelection) {
        return {
          kind: "selection",
          id: button.id,
          items: button.items,
          ...button.title === undefined ? {} : { title: button.title },
          ...button.selectedItem === undefined ? {} : { selectedItem: button.selectedItem }
        };
      }

      return {
        kind: "button",
        title: button.title,
        arguments: this.argumentsFor(button.action),
        ...button.style === undefined ? {} : { style: button.style },
        ...button.tooltip === undefined ? {} : { tooltip: button.tooltip },
        ...button.inputId === undefined ? {} : { inputId: button.inputId },
        ...iconField(button.icon)
      };
    });
    return [...standard, ...extra];
  }

  private present() {
    if (this.isClosed) {
      return;
    }

    const { known } = this;
    const isAllowed = currentPermission(known) === NotificationPermission.GRANTED;
    if (!isAllowed) {
      this.dispatchEvent(new Event("error"));
      return;
    }

    this.replacePrevious();
    const trigger = this.extras.showTrigger;
    const isScheduled = trigger !== undefined && trigger.timestamp > Date.now();
    if (isScheduled) {
      this.schedule(trigger.timestamp);
      return;
    }

    try {
      this.platformId = showNotification({
        source: known.backend,
        state: known.state,
        notification: this.spec()
      });
    } catch {
      this.forget();
      this.isClosed = true;
      this.dispatchEvent(new Event("error"));
      return;
    }

    this.dispatchEvent(new Event("show"));
  }

  private schedule(showAt: number) {
    try {
      this.scheduled = scheduleNotification({
        source: this.known.backend,
        state: this.known.state,
        notification: this.spec(),
        showAt
      });
    } catch {
      this.forget();
      this.isClosed = true;
      this.dispatchEvent(new Event("error"));
    }
  }

  private replacePrevious() {
    const hasTag = this.tag !== "";
    if (!hasTag) {
      return;
    }

    const { byTag } = this.known;
    const previous = byTag.get(this.tagKey());
    byTag.set(this.tagKey(), this);

    const isReplaced = previous !== undefined && previous !== this;
    if (isReplaced) {
      previous.isClosed = true;
      previous.known.live.delete(previous.token);
      previous.dispatchEvent(new Event("close"));
    }
  }

  private spec() {
    const { extras } = this;
    const image = optionalAddress(this.image);
    const hero = optionalAddress(extras.hero);
    const expiration = extras.expiration;
    const controls = this.controls();
    return {
      title: this.title,
      arguments: Object.fromEntries(this.argumentsFor(undefined)),
      tag: this.wireTag,
      group: this.group,
      timestamp: this.timestamp,
      ...this.body === "" ? {} : { body: this.body },
      ...iconField(this.icon),
      ...image === undefined ? {} : { imageUri: image.value },
      ...hero === undefined ? {} : { heroUri: hero.value },
      ...extras.attribution === undefined ? {} : { attribution: extras.attribution },
      ...expiration === undefined ? {} : { expiration: millisecondsOf(expiration) },
      ...this.scenario === undefined ? {} : { scenario: this.scenario },
      ...this.silent === true ? { isSilent: true } : {},
      ...extras.audio === undefined ? {} : { sound: extras.audio },
      ...this.currentProgress === undefined ? {} : { progress: this.currentProgress },
      ...controls.length === 0 ? {} : { controls }
    };
  }
}

/**
 * The notification members of a `ServiceWorkerRegistration`, for code that
 * lists the notifications it showed. There is no service worker here:
 * `notificationRegistration()` is the object to hand such code.
 */
export class NotificationRegistration {
  /**
   * The notifications this run showed that Windows still holds (on screen or
   * in the notification center), so one the user dismissed is not listed.
   * One an earlier run showed is not listed either: `Notification.closeAll()`
   * removes those. A scheduled notification is listed once it has shown, which
   * only the platform knows, so it is not listed here.
   *
   * @param filter - Only the notifications with this `tag`.
   * @returns The notifications.
   */
  async getNotifications(filter: { tag?: string } = {}) {
    const known = requireContext();
    const listed = await known.backend.list();
    const ids = new Set(listed.map(item => item.id));
    return [...known.live.values()].filter(notification => {
      const isTagMatch = filter.tag === undefined || filter.tag === "" || notification.tag === filter.tag;
      return isTagMatch && notification.isListedIn(ids);
    });
  }
}

/**
 * The registration that lists the notifications; needs `installNotification()`.
 *
 * @returns The registration.
 */
export function notificationRegistration() {
  requireContext();
  return new NotificationRegistration();
}

/**
 * Defines `globalThis.Notification` and `TimestampTrigger`, and answers the Permissions API's
 * `notifications`. Nothing is defined until this is called; call it on the
 * thread the app's code runs on.
 *
 * @param options - The app's identity for Windows, and test stand-ins.
 * @returns The function that takes it away again.
 */
export function installNotification(options: NotificationInstallOptions = {}) {
  const previousContext = context;
  const installed: NotificationContext = {
    backend: options.backend ?? windowsNotificationSource(),
    state: options.state ?? notifierState,
    identity: options.identity ?? {},
    appUserModelId: options.appUserModelId,
    live: new Map(),
    byTag: new Map(),
    permission: NotificationPermission.DEFAULT,
    nextToken: 1
  };
  context = installed;
  const uninstallNotification = defineProperty({
    name: "Notification",
    value: Notification
  });
  const uninstallTrigger = defineProperty({
    name: "TimestampTrigger",
    value: TimestampTrigger
  });
  const unregister = registerPermission({
    name: PermissionName.NOTIFICATIONS,
    provider: {
      state() {
        const permission = currentPermission(installed);
        const isUndecided = permission === NotificationPermission.DEFAULT;
        if (isUndecided) {
          return PermissionStateName.PROMPT;
        }

        return permission;
      }
    }
  });
  return () => {
    unregister();
    uninstallTrigger();
    uninstallNotification();
    context = previousContext;
  };
}
