import { uiThreadDispatcherIfReady } from "#src/scheduling.js";
import { AppInstance, ExtendedActivationKind } from "#src/winui.js";
import { z } from "zod";

type AppActivationArguments = ReturnType<AppInstance["getActivatedEventArgs"]>;

const kindNames = new Map<number, string>(
  Object.entries(ExtendedActivationKind).map(([name, value]) => [value, name])
);

// What an activation's data holds that an app reads: the command line of a
// launch, from ILaunchActivatedEventArgs or ICommandLineActivatedEventArgs.
const launchDataSchema = z.looseObject({
  arguments: z.string().optional()
});

/** An activation that another copy of the app redirected to this one. */
export interface Activation {
  /** The `ExtendedActivationKind` member's name, such as `Launch` or `File`; `Unknown` if not known. */
  readonly kind: string;

  /** The command line the other copy was started with, when the activation carries one. */
  readonly commandLine?: string;

  /** The activation's own data, as WinRT gave it: a projected object, or `null`. */
  readonly data: unknown;
}

/** One instance the platform holds for a key. */
export interface RegisteredInstance {
  readonly isCurrent: boolean;
  redirectOwnActivation(): Promise<void>;
  onActivated(callback: (activation: Activation) => void): () => void;
}

/** The part of `AppInstance` that `claimInstance` uses; a test stands in for it. */
export interface InstanceSource {
  register(key: string): RegisteredInstance;
}

/** What `ensureSingleInstance` reports. */
export interface SingleInstance {
  /**
   * True when this process is the first copy for the key and should go on.
   * False when its activation was handed to the first copy: the app should
   * exit without opening a window.
   */
  readonly isPrimary: boolean;

  /** Stops delivering redirected activations. */
  release(): void;
}

/** What `ensureSingleInstance` takes. */
export interface SingleInstanceOptions {
  /** A non-empty name for the app; copies that pass the same key are one app. */
  readonly key: string;

  /**
   * Called in the first copy each time another copy starts and redirects to
   * it, with what that copy was started with. Runs on the UI thread when the
   * dispatcher queue exists (so call this after the first window, or hand
   * work to the window yourself), and on the thread WinRT raises it on
   * otherwise.
   */
  readonly onRedirect: (activation: Activation) => void;
}

function activationOf(args: AppActivationArguments) {
  const parsed = launchDataSchema.safeParse(args.data);
  const commandLine = parsed.success ? parsed.data.arguments : undefined;
  const base = {
    kind: kindNames.get(args.kind) ?? "Unknown",
    data: args.data
  };
  const hasCommandLine = commandLine !== undefined;
  if (!hasCommandLine) {
    return base satisfies Activation;
  }

  return {
    ...base,
    commandLine
  } satisfies Activation;
}

function appInstanceSource() {
  return {
    register(key) {
      const instance = AppInstance.findOrRegisterForKey(key);
      return {
        isCurrent: instance.isCurrent,
        redirectOwnActivation() {
          return instance.redirectActivationToAsync(AppInstance.getCurrent().getActivatedEventArgs());
        },
        onActivated: callback => instance.onActivated((_sender, args) => {
          callback(activationOf(args));
        })
      };
    }
  } satisfies InstanceSource;
}

/**
 * Makes sure one copy of the app runs per key, over any source of instances:
 * `ensureSingleInstance` is this over `AppInstance`.
 *
 * @param options - The key, what to do with a redirected activation, the
 *   source, and how to reach the UI thread.
 * @returns Whether this copy is the first one, and how to stop listening.
 * @throws {Error} When `key` is empty.
 */
export async function claimInstance({ key, onRedirect, source, runOnUiThread }: SingleInstanceOptions & {
  source: InstanceSource;
  runOnUiThread: (work: () => void) => void;
}) {
  const isKeyEmpty = key.length === 0;
  if (isKeyEmpty) {
    throw new Error("ensureSingleInstance needs a non-empty key");
  }

  const instance = source.register(key);
  if (!instance.isCurrent) {
    await instance.redirectOwnActivation();
    return {
      isPrimary: false,
      release() {}
    } satisfies SingleInstance;
  }

  const release = instance.onActivated(activation => {
    runOnUiThread(() => {
      onRedirect(activation);
    });
  });
  return {
    isPrimary: true,
    release
  } satisfies SingleInstance;
}

/**
 * Keeps the app to one copy per key, over `Microsoft.Windows.AppLifecycle.
 * AppInstance`. The first copy to call this with a key is the primary; a later
 * copy has its activation handed to the primary (`onRedirect` runs there with
 * the later copy's command line) and gets `isPrimary: false`, on which it
 * should exit.
 *
 * Call it first thing, before the window. It needs the Windows App SDK
 * runtime (`initWindowsAppSdk`), as the rest of the package does. Without
 * package identity the platform has no app identity to scope the key by, and
 * every Node-hosted app runs as `node.exe`: use a key no other app would, such
 * as a reverse-domain name. This is built on the documented API and checked
 * only against stand-ins here (`test/app.test.ts` starts a real second
 * process, for a desktop session to run).
 *
 * @param options - The key and the redirect handler.
 * @returns Whether this copy is the primary, and how to stop listening.
 */
export function ensureSingleInstance(options: SingleInstanceOptions) {
  return claimInstance({
    ...options,
    source: appInstanceSource(),
    runOnUiThread: uiThreadDispatcherIfReady() ?? (work => {
      work();
    })
  });
}
