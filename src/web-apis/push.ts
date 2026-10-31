import { DomErrorName, domException } from "./dom-exception.ts";
import { HandlerEventTarget } from "./event-handlers.ts";
import { defineNavigatorProperty, defineProperty } from "./install.ts";
import { PermissionStateName, registerPermission } from "./permissions.ts";
import {
  PushNotificationChannelStatus
} from "#winui/microsoft/windows/push-notifications/PushNotificationChannelStatus";
import { PushNotificationManager } from "#winui/microsoft/windows/push-notifications/PushNotificationManager";

const PERMISSION_NAME = "push";
const WINDOWS_EPOCH_OFFSET_MILLISECONDS = 11_644_473_600_000;
const TICKS_PER_MILLISECOND = 10_000;
const HEX_RADIX = 16;
const SUPPORTED_ENCODINGS = ["aes128gcm"];

/** A subscription's channel: what Windows' push service gave this app. */
export interface PushChannel {
  readonly uri: string;

  /** Milliseconds since 1970, or `null` for a channel that does not expire. */
  readonly expirationTime: number | null;
  close(): void;
}

/** What Windows' push service answers; a test stands in for it. */
export interface PushBackend {
  isSupported(): boolean;
  register(): void;
  createChannel(remoteId: string): Promise<PushChannel>;
  onPush(callback: (payload: Uint8Array) => void): () => void;
}

/** What `installPush` takes. */
export interface PushInstallOptions {
  /** Stands in for Windows' push service, for a test. */
  readonly backend?: PushBackend;

  /**
   * The Azure app id Windows' notification service knows this app by; the
   * default `remoteId` of `subscribe`.
   */
  readonly remoteId?: string;
}

/** The options of `PushManager.subscribe`. */
export interface PushSubscriptionOptionsInit {
  readonly userVisibleOnly?: boolean;
  readonly applicationServerKey?: BufferSource | string | null;

  /** The Azure app id for Windows' notification service; overrides the install option. WinUI-only. */
  readonly remoteId?: string;
}

/** What a push subscription was made with. */
export class PushSubscriptionOptions {
  // eslint-disable-next-line @typescript-eslint/naming-convention -- the standard member name
  readonly userVisibleOnly: boolean;
  readonly applicationServerKey: ArrayBuffer | null;

  /** Made by `PushManager.subscribe`. */
  // eslint-disable-next-line @typescript-eslint/naming-convention -- the standard member name
  constructor({ userVisibleOnly, applicationServerKey }: {
    userVisibleOnly: boolean;
    applicationServerKey: ArrayBuffer | null;
  }) {
    this.userVisibleOnly = userVisibleOnly;
    this.applicationServerKey = applicationServerKey;
  }

  get [Symbol.toStringTag]() {
    return "PushSubscriptionOptions";
  }
}

/** The bytes of a push message, with the readers the spec names. */
export class PushMessageData {
  private readonly data: Uint8Array;

  /** Made by the push event. */
  constructor(data: Uint8Array) {
    this.data = data;
  }

  arrayBuffer() {
    return this.data.slice().buffer;
  }

  blob() {
    return new Blob([this.data.slice()]);
  }

  bytes() {
    return this.data.slice();
  }

  json() {
    const parsed: unknown = JSON.parse(this.text());
    return parsed;
  }

  text() {
    return new TextDecoder().decode(this.data);
  }

  get [Symbol.toStringTag]() {
    return "PushMessageData";
  }
}

/** The event `PushManager` fires for each message; WinUI-only (a browser fires it at the service worker). */
export class PushEvent extends Event {
  readonly data: PushMessageData | null;

  /** Made when a message arrives. */
  constructor(type: string, init: { data?: Uint8Array } = {}) {
    super(type);
    this.data = init.data === undefined ? null : new PushMessageData(init.data);
  }
}

/** A push subscription: the channel URI to give the app's server. */
export class PushSubscription {
  readonly endpoint: string;
  readonly expirationTime: number | null;
  readonly options: PushSubscriptionOptions;
  private readonly channel: PushChannel;
  private readonly release: () => void;

  /** Made by `PushManager.subscribe`. */
  constructor({ channel, options, release }: {
    channel: PushChannel;
    options: PushSubscriptionOptions;
    release: () => void;
  }) {
    this.channel = channel;
    this.endpoint = channel.uri;
    this.expirationTime = channel.expirationTime;
    this.options = options;
    this.release = release;
  }

  /** Windows' channel has no encryption keys of its own; always `null`. */
  getKey() {
    return null;
  }

  /** Closes the channel; resolves `true`. */
  async unsubscribe() {
    this.channel.close();
    this.release();
    return true;
  }

  toJSON() {
    return {
      endpoint: this.endpoint,
      expirationTime: this.expirationTime,
      keys: {}
    };
  }

  get [Symbol.toStringTag]() {
    return "PushSubscription";
  }
}

declare global {
  // The extra joins the standard Navigator wherever this module is imported.
  interface Navigator {
    readonly pushManager: PushManager;
  }
}

interface PushContext {
  readonly backend: PushBackend;
  readonly remoteId: string | undefined;
  subscription: PushSubscription | undefined;
  isRegistered: boolean;
  stopListening: (() => void) | undefined;
}

let context: PushContext | undefined;

function requireContext() {
  const known = context;
  const isInstalled = known !== undefined;
  if (isInstalled) {
    return known;
  }

  throw domException({
    name: DomErrorName.INVALID_STATE,
    message: "Push is not installed: call installPush() first"
  });
}

function stateOf(known: PushContext) {
  const isUsable = known.backend.isSupported();
  return isUsable ? PermissionStateName.GRANTED : PermissionStateName.DENIED;
}

function copyKey(key: BufferSource | string | null | undefined) {
  const isEmpty = key == null;
  if (isEmpty) {
    return null;
  }

  const isText = typeof key === "string";
  if (isText) {
    return new TextEncoder().encode(key).buffer;
  }

  const bytes = ArrayBuffer.isView(key)
    ? new Uint8Array(key.buffer, key.byteOffset, key.byteLength)
    : new Uint8Array(key);
  return bytes.slice().buffer;
}

function ensureRegistered(known: PushContext) {
  if (known.isRegistered) {
    return;
  }

  known.backend.register();
  known.isRegistered = true;
}

/** The `registration.pushManager` object; here also `navigator.pushManager`. */
export class PushManager extends HandlerEventTarget {
  static get supportedContentEncodings() {
    return SUPPORTED_ENCODINGS;
  }

  get onpush() {
    return this.getHandler("push");
  }

  set onpush(handler: EventListener | null) {
    this.setHandler({
      type: "push",
      handler
    });
    this.listen();
  }

  /** The state of the `push` permission: Windows asks no one, so `granted` when supported. */
  async permissionState() {
    return stateOf(requireContext());
  }

  /** The live subscription, or `null`. */
  async getSubscription() {
    return requireContext().subscription ?? null;
  }

  /**
   * Opens a WNS channel. Needs the Azure app id (`remoteId`, here or at
   * install) and an app with package identity.
   *
   * @throws {DOMException} `NotSupportedError` when there is no push service
   *     or no remote id, `NetworkError` when the service fails.
   */
  async subscribe(options: PushSubscriptionOptionsInit = {}) {
    const known = requireContext();
    const isUsable = known.backend.isSupported();
    if (!isUsable) {
      throw domException({
        name: DomErrorName.NOT_SUPPORTED,
        message: "Windows push notifications need an app with package identity"
      });
    }

    const { subscription: existing } = known;
    const hasExisting = existing !== undefined;
    if (hasExisting) {
      return existing;
    }

    const remoteId = options.remoteId ?? known.remoteId;
    const hasRemoteId = remoteId !== undefined;
    if (!hasRemoteId) {
      throw domException({
        name: DomErrorName.NOT_SUPPORTED,
        message: "subscribe needs the Azure app id: pass remoteId or give it to installPush"
      });
    }

    ensureRegistered(known);
    const channel = await known.backend.createChannel(remoteId).catch((error: unknown) => {
      throw domException({
        name: DomErrorName.NETWORK,
        message: error instanceof Error ? error.message : String(error)
      });
    });
    const subscription = new PushSubscription({
      channel,
      options: new PushSubscriptionOptions({
        userVisibleOnly: options.userVisibleOnly ?? false,
        applicationServerKey: copyKey(options.applicationServerKey)
      }),
      release() {
        known.subscription = undefined;
      }
    });
    known.subscription = subscription;
    this.listen();
    return subscription;
  }

  override addEventListener(...parameters: Parameters<EventTarget["addEventListener"]>) {
    super.addEventListener(...parameters);
    this.listen();
  }

  private listen() {
    const known = requireContext();
    const isListening = known.stopListening !== undefined;
    const isUsable = known.backend.isSupported();
    const isUnneeded = isListening || !isUsable;
    if (isUnneeded) {
      return;
    }

    ensureRegistered(known);
    known.stopListening = known.backend.onPush(payload => {
      this.dispatchEvent(new PushEvent("push", { data: payload }));
    });
  }

  get [Symbol.toStringTag]() {
    return "PushManager";
  }
}

function windowsPushBackend() {
  return {
    isSupported: () => PushNotificationManager.isSupported(),
    register: () => PushNotificationManager.default_.register(),
    async createChannel(remoteId: string) {
      const result = await PushNotificationManager.default_.createChannelAsync(remoteId);
      const isCreated = result.status === PushNotificationChannelStatus.CompletedSuccess;
      if (!isCreated) {
        throw new Error(`Windows could not create the push channel (0x${(result.extendedError >>> 0).toString(HEX_RADIX)})`);
      }

      const { channel } = result;
      const ticks = Number(channel.expirationTime.universalTime);
      return {
        uri: channel.uri.absoluteUri,
        expirationTime: ticks / TICKS_PER_MILLISECOND - WINDOWS_EPOCH_OFFSET_MILLISECONDS,
        close: () => channel.close()
      };
    },
    onPush: callback => PushNotificationManager.default_.onPushReceived((_sender, args) => {
      callback(new Uint8Array(args.payload));
    })
  } satisfies PushBackend;
}

/**
 * Defines `PushManager`, `PushSubscription`, `PushSubscriptionOptions`,
 * `PushMessageData` and `PushEvent`, plus `navigator.pushManager` (the browser
 * has it on the service worker registration, which an app does not have), over
 * `PushNotificationManager`. The `push` permission is `granted` when Windows
 * supports push for the process and `denied` otherwise. A message fires a
 * `push` event on `navigator.pushManager`. Nothing is defined until this is
 * called.
 *
 * @param options - The Azure app id, and a stand-in for Windows' push service.
 * @returns The function that takes them away again.
 */
export function installPush(options: PushInstallOptions = {}) {
  const previousContext = context;
  const installed: PushContext = {
    backend: options.backend ?? windowsPushBackend(),
    remoteId: options.remoteId,
    subscription: undefined,
    isRegistered: false,
    stopListening: undefined
  };
  context = installed;
  const uninstallers = [
    defineProperty({
      name: "PushManager",
      value: PushManager
    }),
    defineProperty({
      name: "PushSubscription",
      value: PushSubscription
    }),
    defineProperty({
      name: "PushSubscriptionOptions",
      value: PushSubscriptionOptions
    }),
    defineProperty({
      name: "PushMessageData",
      value: PushMessageData
    }),
    defineProperty({
      name: "PushEvent",
      value: PushEvent
    }),
    defineNavigatorProperty({
      name: "pushManager",
      value: new PushManager()
    }),
    registerPermission({
      name: PERMISSION_NAME,
      provider: {
        state: () => stateOf(installed)
      }
    })
  ];
  return () => {
    for (const uninstall of uninstallers.reverse()) {
      uninstall();
    }

    installed.stopListening?.();
    installed.stopListening = undefined;
    context = previousContext;
  };
}
