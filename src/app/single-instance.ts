import { currentUserSid, openPipe, pipeNameFor } from "./instance-pipe.ts";
import type { PipeHandedOver, PipeServer } from "./instance-pipe.ts";
import { decodeRedirect, encodeRedirect } from "./redirect.ts";
import type { Activation } from "./redirect.ts";
import type { Json } from "#src/messaging/json.js";
import { uiThreadDispatcherIfReady } from "#src/scheduling.js";
import { createMessagePortTransport } from "#src/state/transports/message-port.js";
import type { Transport } from "#src/state/transports/transport.js";
import { startTimer } from "#src/window/timers.js";
import { z } from "zod";

const POLL_MILLISECONDS = 100;

// What the worker posts for each line it read: the parsed JSON, or its failure.
const pipeMessageSchema = z.object({ value: z.unknown() });

export type { Activation } from "./redirect.ts";

/** What `ensureSingleInstance` reports. */
export interface SingleInstance {
  /**
   * True when this process is the first copy for the key and should go on.
   * False when its command line was handed to the first copy: the app should
   * exit without opening a window.
   */
  readonly isPrimary: boolean;

  /** Stops listening for later copies and closes the pipe. */
  release(): void;
}

/** What `ensureSingleInstance` takes. */
export interface SingleInstanceOptions {
  /** A non-empty name for the app; copies of the same user that pass the same key are one app. */
  readonly key: string;

  /**
   * Called in the first copy each time another copy starts, with the
   * arguments and working directory it was started with. Runs on the UI
   * thread.
   */
  readonly onRedirect: (activation: Activation) => void;

  /**
   * The app's window (a `WindowHandle`, say): it is brought to the front
   * before `onRedirect` runs.
   */
  readonly window?: {
    bringToFront(): void;
  };
}

/** The first copy's end of the link, as `claimInstance` uses it. */
export interface InstanceServer {
  readonly isPrimary: true;
  readonly transport: Transport<Json>;
  close(): void;
}

/** What `claimInstance` asks of the link; a test stands in for it. */
export interface InstanceSource {
  /** Serves the key when no one does; otherwise delivers `activation` to whoever does. */
  claim(options: {
    key: string;
    activation: Activation;
  }): InstanceServer | PipeHandedOver;
}

function requireUiThread() {
  const dispatcher = uiThreadDispatcherIfReady();
  const isUnavailable = dispatcher === undefined;
  if (isUnavailable) {
    throw new Error("ensureSingleInstance in the first copy needs the UI thread's dispatcher queue: call it from runWindow's onStart or later");
  }

  return dispatcher;
}

function pipeSource() {
  return {
    claim({ key, activation }) {
      const pipeName = pipeNameFor({
        key,
        sid: currentUserSid()
      });
      const pipe = openPipe({
        pipeName,
        payload: encodeRedirect(activation)
      });
      if (!pipe.isPrimary) {
        return pipe;
      }

      return serverOf(pipe);
    }
  } satisfies InstanceSource;
}

function serverOf(pipe: PipeServer) {
  try {
    requireUiThread();
  } catch (error) {
    pipe.close();
    throw error;
  }

  return {
    isPrimary: true,
    close: () => pipe.close(),
    transport: createMessagePortTransport<Json>({
      port: pipe.port,
      poll: drain => startTimer({
        milliseconds: POLL_MILLISECONDS,
        onTick: drain
      })
    })
  } satisfies InstanceServer;
}

/**
 * Makes sure one copy of the app runs per key, over any source of the link:
 * `ensureSingleInstance` is this over a named pipe.
 *
 * @param options - The key, what to do with a redirect, the link, this
 *   copy's own activation, and how to reach the UI thread.
 * @returns Whether this copy is the first one, and how to stop listening.
 * @throws {Error} When `key` is empty.
 */
export function claimInstance({ key, onRedirect, window, source, activation, runOnUiThread }: SingleInstanceOptions & {
  source: InstanceSource;
  activation: Activation;
  runOnUiThread: (work: () => void) => void;
}) {
  const isKeyEmpty = key.length === 0;
  if (isKeyEmpty) {
    throw new Error("ensureSingleInstance needs a non-empty key");
  }

  const claim = source.claim({
    key,
    activation
  });
  if (!claim.isPrimary) {
    return {
      isPrimary: false,
      release() {}
    } satisfies SingleInstance;
  }

  const stopListening = claim.transport.listen({
    message(value) {
      const message = pipeMessageSchema.safeParse(value);
      const redirect = decodeRedirect(message.success ? message.data.value : undefined);
      const isIgnored = redirect === undefined;
      if (isIgnored) {
        return;
      }

      runOnUiThread(() => {
        window?.bringToFront();
        onRedirect(redirect);
      });
    },
    malformed() {},
    closed() {}
  });
  return {
    isPrimary: true,
    release() {
      stopListening();
      claim.close();
    }
  } satisfies SingleInstance;
}

/**
 * Keeps the app to one copy per key, over a named pipe that only the current
 * user can reach. The first copy to call this with a key is the primary and
 * serves the pipe; a later copy sends its arguments and working directory
 * (`onRedirect` runs in the primary with them) and gets `isPrimary: false`,
 * on which it should exit.
 *
 * It works unpackaged and from `node.exe`, and needs no Windows App SDK
 * call. The primary must call it where the UI thread has its dispatcher
 * queue (`runWindow`'s `onStart` or later) because it polls for later copies
 * on a dispatcher timer; a later copy may call it at any time. Use a key no
 * other app would, such as a reverse-domain name.
 *
 * @param options - The key, the redirect handler and, optionally, a window to
 *   bring to the front on a redirect.
 * @returns Whether this copy is the primary, and how to stop listening.
 */
export function ensureSingleInstance(options: SingleInstanceOptions) {
  return claimInstance({
    ...options,
    source: pipeSource(),
    activation: {
      arguments: process.argv.slice(2),
      workingDirectory: process.cwd()
    },
    runOnUiThread: work => requireUiThread()(work)
  });
}
