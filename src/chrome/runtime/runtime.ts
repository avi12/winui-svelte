import { appUrl, resolveIdentity } from "./identity.ts";
import type { AppIdentity, IdentitySources } from "./identity.ts";
import { detectInstalled, fileVersionStore } from "./installed.ts";
import type { InstalledDetails, VersionStore } from "./installed.ts";
import { RuntimeLink } from "./link.ts";
import { MessageEvent } from "./message-event.ts";
import { connectNativeHost, sendNativeHostMessage } from "./native-host.ts";
import type { NativeHostSetup } from "./native-host.ts";
import { Port } from "./port.ts";
import { RuntimeUpdates } from "./updates.ts";
import type { RuntimeUpdateSource } from "./updates.ts";
import { relaunch } from "#src/app/relaunch.js";
import { onStartup } from "#src/app/schedule/events.js";
import { ChromeEvent } from "#src/downloads/chrome-event.js";
import type { Json } from "#src/messaging/json.js";
import type { Transport } from "#src/state/transports/transport.js";

const MANIFEST_VERSION = 3;
const ARCHITECTURES = new Map([
  ["x64", "x86-64"],
  ["arm64", "arm64"],
  ["ia32", "x86-32"]
]);

function stopAtProcessExit(listener: () => void) {
  process.once("exit", listener);
  return () => process.off("exit", listener);
}

/** Where the app is running, as `chrome.runtime.getPlatformInfo` reports. */
export interface PlatformInfo {
  readonly os: "win";
  readonly arch: string;
}

/** Chrome's manifest, as far as an app has one. */
export interface RuntimeManifest {
  // eslint-disable-next-line @typescript-eslint/naming-convention -- Chrome's own key
  readonly manifest_version: typeof MANIFEST_VERSION;
  readonly name: string;
  readonly version: string;
  readonly description?: string | undefined;
}

/** What `new Runtime` takes; every part has a real default. */
export interface RuntimeOptions extends IdentitySources, Omit<NativeHostSetup, "id"> {
  /** Remembers the last version that ran, for `onInstalled`; a file under `%LOCALAPPDATA%` by default. */
  readonly versionStore?: VersionStore;

  /** A message or request unanswered for this long rejects; unlimited by default. */
  readonly timeoutMilliseconds?: number;

  /** Starts a new copy of the app and exits this one; `relaunch` of `winui-svelte/app` by default. */
  readonly relaunchApp?: () => void;

  /**
   * Subscribes to the end of the process for `onSuspend`; returns how to
   * stop. `process.once("exit")` by default; `null` subscribes to nothing.
   */
  readonly suspendSource?: ((listener: () => void) => () => void) | null;

  /** The CPU architecture name Node reports; `process.arch` by default. */
  readonly architecture?: string;

  /** Where `requestUpdateCheck` looks for a newer version; none by default, and then it answers `no_update`. */
  readonly updates?: RuntimeUpdateSource;

  /** Ends this process after `reload` started a newer version; `process.exit` by default. */
  readonly exitApp?: () => void;
}

/**
 * `chrome.runtime` for a native app. Contexts of the app (windows, worker
 * threads) are joined by `addLink` with a transport each; `sendMessage` and
 * `connect` reach every other linked context, `onMessage` and `onConnect`
 * hear them. A failure is a rejected promise, or `Port.error`, where Chrome
 * sets `chrome.runtime.lastError`; there is no `lastError`. `onStartup`
 * is the one of `winui-svelte/app/schedule`, fired by `startActivation`.
 *
 * Nothing runs when this module is imported; make one `Runtime` per context.
 */
export class Runtime {
  /** Fires in a context when another sends a message. */
  readonly onMessage = new MessageEvent();

  /** Fires in a context when another opens a port to it. */
  readonly onConnect = new ChromeEvent<(port: Port) => void>();

  /** Fires after `detectInstalled` sees a first run or a new version. */
  readonly onInstalled = new ChromeEvent<(details: InstalledDetails) => void>();

  /** Fires when the process is about to end; the app cannot be suspended otherwise. */
  readonly onSuspend = new ChromeEvent<() => void>();

  /** Fires when Windows started the app at sign-in. */
  readonly onStartup = onStartup;

  /** Fires when `requestUpdateCheck` has unpacked a newer version; `reload` starts it. */
  readonly onUpdateAvailable: RuntimeUpdates["onUpdateAvailable"];

  private readonly options: RuntimeOptions;
  private readonly links = new Set<RuntimeLink>();
  private readonly stopSuspend: (() => void) | undefined;
  private readonly updates: RuntimeUpdates;
  private cachedIdentity: AppIdentity | undefined;

  constructor(options: RuntimeOptions = {}) {
    this.options = options;
    this.updates = new RuntimeUpdates({
      source: options.updates,
      currentVersion: this.getManifest().version
    });
    this.onUpdateAvailable = this.updates.onUpdateAvailable;
    const { suspendSource } = options;
    const source = suspendSource === undefined ? stopAtProcessExit : suspendSource;
    this.stopSuspend = source?.(() => this.onSuspend.dispatch());
  }

  /** The app's id: the package family name, or the `package.json` name. */
  get id() {
    return this.identity().id;
  }

  /**
   * The manifest: name, version and description from the package or
   * `package.json`.
   *
   * @returns Chrome's manifest shape, `manifest_version` 3.
   */
  getManifest() {
    const { name, version, description } = this.identity();
    return {
      // eslint-disable-next-line @typescript-eslint/naming-convention -- Chrome's own key
      manifest_version: MANIFEST_VERSION,
      name,
      version,
      description
    } satisfies RuntimeManifest;
  }

  /**
   * The address of a file in the app: `ms-appx:///path` in a package, a
   * `file:` URL under the folder of `package.json` otherwise.
   *
   * @param relativePath - The file's path inside the app.
   * @returns The address.
   */
  getURL(relativePath: string) {
    return appUrl({
      identity: this.identity(),
      relativePath
    });
  }

  /**
   * Where the app runs.
   *
   * @returns The OS (always `win`) and the CPU architecture in Chrome's names.
   */
  getPlatformInfo() {
    const architecture = this.options.architecture ?? process.arch;
    return {
      os: "win",
      arch: ARCHITECTURES.get(architecture) ?? architecture
    } satisfies PlatformInfo;
  }

  /**
   * Joins another context to this one over a transport; the other context
   * does the same with its end.
   *
   * @param transport - A link to the other context (a worker's message port, stdio, memory).
   * @returns How to leave: closes the transport.
   */
  addLink(transport: Transport) {
    const link = new RuntimeLink({
      transport,
      senderId: this.id,
      timeoutMilliseconds: this.options.timeoutMilliseconds,
      onMessage: ({ senderId, message }) => this.onMessage.collect({
        message,
        sender: {
          id: senderId
        }
      }),
      onConnect: port => this.onConnect.dispatch(port),
      onClosed: () => this.links.delete(link)
    });
    this.links.add(link);
    return () => {
      this.links.delete(link);
      link.close();
    };
  }

  /**
   * Sends a message to every other linked context and resolves with the
   * first answer.
   *
   * @param message - A JSON value.
   * @returns What a listener answered, or undefined when listeners heard it
   *   and none answered.
   * @throws {Error} When no context is linked or none listens ("Could not
   *   establish connection. Receiving end does not exist."), or the
   *   answering listener failed.
   */
  async sendMessage(message: Json) {
    const results = await Promise.allSettled([...this.links].map(link => link.send(message)));
    const replies = results.flatMap(result => result.status === "fulfilled" ? [result.value] : []);
    const answered = replies.find(reply => reply.isHandled);
    const failure = answered?.error ?? null;
    const hasFailed = failure !== null;
    if (hasFailed) {
      throw new Error(failure);
    }

    const isAnswered = answered !== undefined;
    if (isAnswered) {
      return answered.hasResponse ? answered.response : undefined;
    }

    const hasListener = replies.some(reply => reply.hasListeners);
    if (hasListener) {
      return undefined;
    }

    throw new Error("Could not establish connection. Receiving end does not exist.");
  }

  /**
   * Opens a long-lived port to every other linked context.
   *
   * @param options - The port's name.
   * @returns The port; with no context linked it disconnects at once with an
   *   `error`.
   */
  connect({ name = "" }: { name?: string } = {}) {
    const port = new Port({ name });
    for (const link of this.links) {
      link.open({
        port,
        name
      });
    }

    const hasNoLinks = this.links.size === 0;
    if (hasNoLinks) {
      queueMicrotask(() => port.fail(new Error("Could not establish connection. Receiving end does not exist.")));
    }

    return port;
  }

  /**
   * Starts a registered native messaging host and talks to it over a port.
   *
   * @param application - The host's name, such as `com.example.host`.
   * @returns The port, as `Port` says.
   */
  connectNative(application: string) {
    return connectNativeHost({
      application,
      ...this.nativeSetup()
    });
  }

  /**
   * Sends one message to a registered native messaging host and resolves
   * with its first reply.
   *
   * @param options - The host's name and the message.
   * @returns The reply.
   * @throws {Error} When the host is not found, cannot start, or exits first.
   */
  sendNativeMessage({ application, message }: {
    application: string;
    message: Json;
  }) {
    return sendNativeHostMessage({
      application,
      message,
      ...this.nativeSetup()
    });
  }

  /**
   * Compares the version that last ran with this one, remembers this one and
   * fires `onInstalled`; call it once at start.
   *
   * @returns The details, or null when this version ran before.
   */
  async detectInstalled() {
    const { id, version } = this.identity();
    const details = await detectInstalled({
      store: this.options.versionStore ?? fileVersionStore(id),
      version
    });
    const isNew = details !== null;
    if (isNew) {
      this.onInstalled.dispatch(details);
    }

    return details;
  }

  /**
   * Asks the update feed for a newer version and unpacks it beside the
   * running one; `onUpdateAvailable` fires when there is one.
   *
   * @returns `update_available` with the version, `no_update` or `throttled`.
   */
  requestUpdateCheck() {
    return this.updates.requestUpdateCheck();
  }

  /** Starts the newer version `requestUpdateCheck` unpacked, else a new copy of this one, and exits this one. */
  reload() {
    const isUpdating = this.updates.startStaged();
    if (isUpdating) {
      (this.options.exitApp ?? (() => process.exit(0)))();
      return;
    }

    (this.options.relaunchApp ?? relaunch)();
  }

  /** Closes every link and stops listening for the end of the process. */
  dispose() {
    this.stopSuspend?.();
    for (const link of this.links.values().toArray()) {
      link.close();
    }

    this.links.clear();
  }

  private identity() {
    this.cachedIdentity ??= resolveIdentity(this.options);
    return this.cachedIdentity;
  }

  private nativeSetup() {
    return {
      id: this.id,
      registry: this.options.registry,
      resolveHost: this.options.resolveHost,
      spawnHost: this.options.spawnHost
    } satisfies NativeHostSetup;
  }
}
