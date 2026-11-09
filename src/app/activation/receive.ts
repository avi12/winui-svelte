import { classifyActivation } from "./classify.ts";
import { ActivationKind } from "./kinds.ts";
import type { ActivationEvent } from "./kinds.ts";
import { packagedActivation, withPackagedActivation } from "./packaged.ts";
import type { PackagedActivation } from "./packaged.ts";
import { dispatchAlarm, dispatchStartup } from "#src/app/schedule/events.js";
import { ensureSingleInstance } from "#src/app/single-instance.js";
import type { Activation, SingleInstance, SingleInstanceOptions } from "#src/app/single-instance.js";

/** What `startActivation` takes. */
export interface ActivationOptions {
  /** The single-instance key, as `ensureSingleInstance` takes it. */
  readonly key: string;

  /** Called once for each activation, in order, on the UI thread for a redirect; one at a time. */
  readonly onActivation: (event: ActivationEvent) => unknown;

  /** The window to bring to the front on a redirect, as `ensureSingleInstance` takes it. */
  readonly window?: SingleInstanceOptions["window"];

  /**
   * The extensions (with their dots) a file argument must have to count as a
   * `file` activation; any existing file counts when omitted.
   */
  readonly extensions?: readonly string[];

  /**
   * The `launchQueue` of `installLaunch` (or any object with
   * `enqueueActivation`) to hand each redirect to as well; the first start's
   * command line reaches `launchQueue` through `installLaunch` itself.
   */
  readonly launchQueue?: {
    enqueueActivation(activation: Activation): unknown;
  };

  /** Called when classifying or `onActivation` fails; rethrown on the event loop when omitted. */
  readonly onError?: (error: unknown) => void;

  /** This copy's own command line without the program; `process.argv` minus the first two entries by default. */
  readonly initialArguments?: readonly string[];

  /**
   * How Windows started this packaged process, read once for this copy's own
   * start (see `packagedActivation`); the Windows App SDK's by default.
   */
  readonly packaged?: () => PackagedActivation | undefined;

  /** Stands in for `ensureSingleInstance`; the tests give one. */
  readonly claim?: (options: SingleInstanceOptions) => SingleInstance;
}

function extensionSetOf(extensions: readonly string[] | undefined) {
  const isAny = extensions === undefined;
  return isAny ? undefined : new Set(extensions.map(extension => extension.toLowerCase()));
}

function rethrowLater(error: unknown) {
  queueMicrotask(() => {
    throw error;
  });
}

/**
 * Brings every way the app is started to one place: a typed
 * `ActivationEvent` for this copy's own start (a double-clicked file, a
 * `scheme:` link, the startup entry, plain) and for every later copy, which
 * `ensureSingleInstance` hands to the first. A later copy exits (its
 * `isPrimary` is false) and gets no event; the first copy gets one for it.
 * An `alarm` activation also reaches the `onAlarm` listeners and a `startup`
 * one the `onStartup` listeners of `winui-svelte/app/schedule`, before
 * `onActivation`. In a packaged app this copy's own start also reads the Windows
 * App SDK's activation: a protocol address the command line lacks, and a
 * startup task (which passes no argument), become the same events. Events
 * arrive in order, one at a time. Nothing is registered with Windows here;
 * see `installProtocolHandlers`, `registerFileTypes` and `launchAtLogin`.
 *
 * @param options - The key, the listener and what to bring along.
 * @returns Whether this copy is the first one, and how to stop listening.
 */
export function startActivation(options: ActivationOptions) {
  const {
    onActivation,
    launchQueue,
    onError = rethrowLater,
    claim = ensureSingleInstance,
    packaged = packagedActivation
  } = options;
  const extensions = extensionSetOf(options.extensions);
  let tail: Promise<unknown> = Promise.resolve();
  function deliver({ activation, isRedirect }: {
    activation: Activation;
    isRedirect: boolean;
  }) {
    tail = tail.then(async () => {
      const event = await classifyActivation({
        activation,
        isRedirect,
        ...extensions === undefined ? {} : { extensions }
      });
      if (isRedirect) {
        await launchQueue?.enqueueActivation(activation);
      }

      const isAlarm = event.kind === ActivationKind.alarm;
      if (isAlarm) {
        dispatchAlarm(event.alarm);
      }

      const isStartup = event.kind === ActivationKind.startup;
      if (isStartup) {
        dispatchStartup();
      }

      await onActivation(event);
    }).catch(onError);
  }

  const single = claim({
    key: options.key,
    ...options.window === undefined ? {} : { window: options.window },
    onRedirect: activation => deliver({
      activation,
      isRedirect: true
    })
  });
  if (single.isPrimary) {
    deliver({
      activation: {
        arguments: [...withPackagedActivation({
          values: options.initialArguments ?? process.argv.slice(2),
          packaged: packaged()
        })],
        workingDirectory: process.cwd()
      },
      isRedirect: false
    });
  }

  return single;
}
