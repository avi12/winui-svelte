import { describeError, errorOf } from "./diagnostics.ts";
import type { Json } from "#src/messaging/json.js";
import { format } from "node:util";
import type { MessagePort } from "node:worker_threads";
import { receiveMessageOnPort } from "node:worker_threads";
import type { HotPayload } from "vite";
import type { HMRLogger, ModuleRunnerTransport } from "vite/module-runner";
import { createNodeImportMeta, ESModulesEvaluator, ModuleRunner } from "vite/module-runner";

/**
 * The window thread's side of `server.ts`: a module runner that loads the
 * window's modules from the dev server and applies its hot updates.
 *
 * WinUI's message loop holds the window thread and never gives it back to
 * Node, so once the window is up, no 'message' event arrives here: the app
 * calls `receive()` from a timer of WinUI's own (a DispatcherQueue timer), on
 * the UI thread, and every reply and update is handled there.
 */
export interface WindowModuleRunner {
  readonly runner: ModuleRunner;
  /** Takes in everything the server has sent. */
  receive(): void;
}

/**
 * The event HMR's lines are sent under, for the server to print: this
 * worker's own stderr is written through the main thread, which may be busy
 * or gone when the window closes, so the lines go to the server to print.
 * (Nor do they go to stdout, which is often the host's channel, as Edge+'s
 * core reads it line by line.)
 */
export const LOG_EVENT = "winui:log";

// The module server always answers, so an invoke waits without a deadline.
const NO_TIMEOUT = 0;
const FULL_RELOAD = "full-reload";

function isHotPayload(value: HotPayload | Json): value is HotPayload {
  return typeof value === "object" && value !== null && "type" in value;
}

function restartNotice(file: string | undefined) {
  return `${file ?? "a module"} changed and no component takes it in place; restart the window to see it`;
}

/** Creates the module runner for the window thread, over the port the dev server holds the other end of. */
export function createWindowModuleRunner(port: MessagePort) {
  let handle: ((payload: HotPayload) => void) | null = null;

  // An error is described by where it is (a compile error's file and line),
  // not dumped with everything it carries.
  function log(...messages: Array<string | Error>) {
    const lines = messages.map(message => message instanceof Error ? describeError(message) : message);
    port.postMessage({
      type: "custom",
      event: LOG_EVENT,
      data: format(...lines)
    });
  }

  // An update that cannot be applied (a component that no longer compiles)
  // is reported and the window goes on with the code it has: an exception
  // here would end it, since it surfaces in a callback WinUI made.
  function reportFailure(error: Error) {
    log("the hot update failed:", error);
  }

  function handleSafely(payload: HotPayload) {
    try {
      Promise.resolve(handle?.(payload)).catch((error: Error) => reportFailure(errorOf(error)));
    } catch (error) {
      reportFailure(errorOf(error));
    }
  }

  function deliver(message: HotPayload | Json) {
    if (!isHotPayload(message)) {
      return;
    }

    // A change no module accepts would rerun the window's entry, which
    // starts a second window: the developer restarts it instead.
    const isFullReload = message.type === FULL_RELOAD;
    if (isFullReload) {
      log(restartNotice(message.triggeredBy));
      return;
    }

    handleSafely(message);
  }

  process.on("unhandledRejection", error => reportFailure(errorOf(error)));
  const logger: HMRLogger = {
    debug: log,
    error: log
  };
  const transport: ModuleRunnerTransport = {
    connect({ onMessage }) {
      handle = onMessage;
      // Until WinUI takes the thread, Node delivers messages itself.
      port.on("message", deliver);
    },
    send(payload) {
      port.postMessage(payload);
    },
    timeout: NO_TIMEOUT
  };
  const runner = new ModuleRunner({
    transport,
    createImportMeta: createNodeImportMeta,
    hmr: {
      logger
    }
  }, new ESModulesEvaluator());
  const windowRunner: WindowModuleRunner = {
    runner,
    receive() {
      for (let received = receiveMessageOnPort(port); received !== undefined; received = receiveMessageOnPort(port)) {
        deliver(received.message);
      }
    }
  };
  return windowRunner;
}
