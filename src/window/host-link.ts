import { exitApplication } from "./application.ts";

// A window process that outlives its host keeps its windows and its
// message pump running for nobody. The host's end of the link going away is
// the signal; a host that dies without closing the pipe cleanly (a grandchild
// still holds it) is found by its process id instead.

const DEFAULT_POLL_MILLISECONDS = 1000;
const NO_SIGNAL = 0;

/** What `exitWhenHostEnds` listens to: a `HostChannel` of `winui-svelte/state` is one. */
export interface HostLink {
  /** Calls `listener` once the link to the host has closed. */
  onClosed(listener: () => void): void;
}

/** How a window process learns its host is gone. */
export interface HostEndOptions {
  /** The link to the host: its closing ends the window process. */
  link?: HostLink;

  /**
   * The host's process id: the process ends when that process does, even if
   * the link never closes. Needs the id to still be the host's, which holds
   * for as long as the host runs.
   */
  hostProcessId?: number;

  /** How often the host process is looked for (default 1000). */
  pollMilliseconds?: number;

  /** What ends the window process; `exitApplication` by default. */
  exit?: () => void;
}

function isProcessRunning(processId: number) {
  try {
    process.kill(processId, NO_SIGNAL);
    return true;
  } catch {
    return false;
  }
}

/**
 * Ends the application (so `runWindow` settles and the process exits) when the
 * host goes away: the link closes, or the host process is gone. Call it on the
 * UI thread once WinUI is up, from `onStart`.
 *
 * @param options - The link and, or, the host's process id.
 * @returns A function that stops watching.
 */
export function exitWhenHostEnds({
  link,
  hostProcessId,
  pollMilliseconds = DEFAULT_POLL_MILLISECONDS,
  exit = exitApplication
}: HostEndOptions) {
  let isEnded = false;
  let poll: ReturnType<typeof setInterval> | undefined;

  function end() {
    if (isEnded) {
      return;
    }

    isEnded = true;
    stop();
    exit();
  }

  function stop() {
    clearInterval(poll);
    poll = undefined;
  }

  link?.onClosed(end);
  const hasHostProcess = hostProcessId !== undefined;
  if (hasHostProcess) {
    poll = setInterval(() => {
      const isHostGone = !isProcessRunning(hostProcessId);
      if (isHostGone) {
        end();
      }
    }, pollMilliseconds);
    poll.unref();
  }

  return stop;
}
