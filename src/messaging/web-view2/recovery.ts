import { messageOf, waitForCoreWebView2 } from "./core.ts";
import type { CoreWebView2Like, WebView2Like } from "./core.ts";
import { CoreWebView2ProcessFailedKind } from "#winui/microsoft/web/web-view2/core/CoreWebView2ProcessFailedKind";

/** What went wrong in the browser, as `keepWebView2Alive` tells the app. */
export const ProcessFailureKind = {
  BROWSER_EXITED: "browserExited",
  RENDER_EXITED: "renderExited",
  UNRESPONSIVE: "unresponsive",
  OTHER: "other"
} as const;
/** One of the values of `ProcessFailureKind`. */
export type ProcessFailureKind = (typeof ProcessFailureKind)[keyof typeof ProcessFailureKind];

const KINDS = new Map<number, ProcessFailureKind>([
  [CoreWebView2ProcessFailedKind.BrowserProcessExited, ProcessFailureKind.BROWSER_EXITED],
  [CoreWebView2ProcessFailedKind.RenderProcessExited, ProcessFailureKind.RENDER_EXITED],
  [CoreWebView2ProcessFailedKind.FrameRenderProcessExited, ProcessFailureKind.RENDER_EXITED],
  [CoreWebView2ProcessFailedKind.RenderProcessUnresponsive, ProcessFailureKind.UNRESPONSIVE]
]);
const DEFAULT_MAX_CRASHES = 3;
const DEFAULT_WINDOW_MILLISECONDS = 30_000;

/** The control that `keepWebView2Alive` watches, and the means to stop or restart it. */
export interface WebView2Guard {
  /**
   * Tries again after the guard gave up (`onGaveUp`): forgets the failures
   * so far and rebuilds the control, as for a browser that exited
   * Does nothing while a recovery is running or after `dispose`
   */
  retry(): Promise<void>;
  /** Stops listening; a recovery already running finishes. */
  dispose(): void;
}

function quietly(action: () => void) {
  try {
    action();
  } catch {
    // A dead core may throw while its handler is removed; there is nothing left to undo
  }
}

/**
 * Keeps a `WebView2` working through the browser's crashes, with no action
 * from the user
 *
 * It runs `setup` with the core of `control`, then watches the control's
 * `CoreProcessFailed`:
 *
 * - the browser process exiting leaves the control dead, so it calls
 *   `rebuild`, which must resolve with a new control that is already
 *   started (`startWebView2`), then runs `setup` with the new core
 * - any other process failing (a renderer, a utility process) reloads the
 *   page in place
 * - more than `maxCrashes` failures within `windowMilliseconds` stop the
 *   loop: `onGaveUp` is called once, and nothing more happens until
 *   `retry()`
 * - a failure while a recovery is running is ignored, so one is never run twice
 *
 * Everything bound to the old core is lost with it: scripts from
 * `addDocumentCreatedScript`, the handlers (`onNavigationStarting`,
 * `onPermissionRequested`, `onWebResourceRequested`), a `webView2Transport`
 * and its messaging; put them in `setup`, which runs again after every rebuild
 * Cookies and storage live in the profile folder and survive; a page that is
 * only reloaded keeps the scripts and handlers, and loses its own state
 *
 * A failure of `rebuild` or `setup` gives up, with the error's text as the
 * reason
 *
 * @param options - The control and the policy.
 * @returns The guard.
 */
export function keepWebView2Alive({
  control,
  setup,
  rebuild,
  maxCrashes = DEFAULT_MAX_CRASHES,
  windowMilliseconds = DEFAULT_WINDOW_MILLISECONDS,
  onRecovering,
  onGaveUp
}: {
  control: WebView2Like;
  setup(core: CoreWebView2Like): void | Promise<void>;
  rebuild(): Promise<WebView2Like>;
  maxCrashes?: number;
  windowMilliseconds?: number;
  onRecovering?(failure: { readonly kind: ProcessFailureKind }): void;
  onGaveUp?(failure: { readonly reason: string }): void;
}) {
  let current = control;
  let unsubscribe: (() => void) | undefined;
  let failures: number[] = [];
  let isRecovering = false;
  let isGivenUp = false;
  let isDisposed = false;

  function giveUp(reason: string) {
    isGivenUp = true;
    onGaveUp?.({ reason });
  }

  function watch(next: WebView2Like) {
    current = next;
    unsubscribe = next.onCoreProcessFailed((_sender, args) => {
      void recover(KINDS.get(args.processFailedKind) ?? ProcessFailureKind.OTHER);
    });
  }

  async function run(kind: ProcessFailureKind) {
    const isRebuild = kind === ProcessFailureKind.BROWSER_EXITED;
    if (!isRebuild) {
      (await waitForCoreWebView2(current)).reload();
      return;
    }

    quietly(() => unsubscribe?.());
    watch(await rebuild());
    await setup(await waitForCoreWebView2(current));
  }

  async function recover(kind: ProcessFailureKind) {
    const isIgnored = isDisposed || isGivenUp || isRecovering;
    if (isIgnored) {
      return;
    }

    const now = Date.now();
    failures = [...failures.filter(failedAt => now - failedAt < windowMilliseconds), now];
    const isStreak = failures.length > maxCrashes;
    if (isStreak) {
      giveUp(`${failures.length} failures within ${windowMilliseconds} ms`);
      return;
    }

    isRecovering = true;
    onRecovering?.({ kind });
    try {
      await run(kind);
    } catch (error) {
      giveUp(messageOf(error));
    } finally {
      isRecovering = false;
    }
  }

  async function start() {
    isRecovering = true;
    watch(control);
    try {
      await setup(await waitForCoreWebView2(control));
    } catch (error) {
      giveUp(messageOf(error));
    } finally {
      isRecovering = false;
    }
  }

  void start();
  const guard: WebView2Guard = {
    async retry() {
      const isBusy = isDisposed || isRecovering;
      if (isBusy) {
        return;
      }

      isGivenUp = false;
      failures = [];
      await recover(ProcessFailureKind.BROWSER_EXITED);
    },
    dispose() {
      isDisposed = true;
      quietly(() => unsubscribe?.());
    }
  };
  return guard;
}
