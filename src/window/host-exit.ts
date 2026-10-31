import { changeEvent, createNamedEvent, openNamedEvent, waitForEvent } from "./native.ts";
import { isMainThread } from "node:worker_threads";

// A host that calls `process.exit` while the window's thread is still in
// WinUI ends the process under that thread: a delegate WinUI calls on its way
// out finds the Node environment closing ("Cannot invoke a callback while the
// Node environment is closing") and the process can end with 0xC000027B. The
// window therefore publishes its loop by name, and the host's exit hook asks
// it to quit and waits, for a moment, until it has.

const REQUEST_WAIT_MILLISECONDS = 5000;
const NOT_WAITING = 0;
const NO_EVENT = 0n;

function namesOf(processId: number) {
  return {
    running: `Localwinui-svelte-${processId}-window-running`,
    request: `Localwinui-svelte-${processId}-window-exit-request`,
    done: `Localwinui-svelte-${processId}-window-exit-done`
  };
}

/** What the window's loop waits on besides messages: the host asking it to quit. */
export interface HostExitRequest {
  /** The event handle the message wait includes. */
  readonly event: bigint;

  /** Called when the host has signalled it. */
  onRequest(): void;
}

/**
 * Publishes this process's window loop, on the UI thread: the host's exit hook
 * can then ask it to quit. Returns the request for the message wait and the
 * call that says the loop has ended.
 */
export function publishWindowLoop(onRequest: () => void) {
  const names = namesOf(process.pid);
  const request = createNamedEvent({
    name: names.request,
    isSet: false,
    isAutoReset: true
  });
  const done = createNamedEvent({
    name: names.done,
    isSet: false,
    isAutoReset: false
  });
  const running = createNamedEvent({
    name: names.running,
    isSet: true,
    isAutoReset: false
  });
  return {
    request: {
      event: request,
      onRequest
    } satisfies HostExitRequest,
    finish() {
      changeEvent({
        event: running,
        isSet: false
      });
      changeEvent({
        event: done,
        isSet: true
      });
    }
  };
}

/**
 * On the host's main thread: when the process is about to exit while a window
 * loop of this process runs, asks it to quit and waits (at most five seconds)
 * for it. Nothing happens when no window runs.
 */
export function guardProcessExit() {
  if (!isMainThread) {
    return;
  }

  process.once("exit", () => {
    const names = namesOf(process.pid);
    const running = openNamedEvent(names.running);
    const isPublished = running !== NO_EVENT;
    const isRunning = isPublished && waitForEvent({
      event: running,
      milliseconds: NOT_WAITING
    });
    if (!isRunning) {
      return;
    }

    changeEvent({
      event: openNamedEvent(names.request),
      isSet: true
    });
    waitForEvent({
      event: openNamedEvent(names.done),
      milliseconds: REQUEST_WAIT_MILLISECONDS
    });
  });
}
