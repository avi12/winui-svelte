// Where an exception thrown by app code on the UI thread ends up. WinUI calls
// the app from native code (an event, a dispatcher callback, a timer), and an
// exception that escapes there reaches the process as a bare
// `napi_make_callback failed with status 10`, with no message and no stack.
// Every such boundary catches the exception and reports it here instead: the
// stack goes to stderr, and the listeners (`runWindow({ onerror })`) are told.
// The exception is not swallowed, only kept from killing the native caller.

/** An exception caught at a boundary between WinUI and app code. */
export interface UiErrorReport {
  /** What was thrown. */
  readonly error: unknown;

  /** Where it was caught: `event "ontoggled"`, `prop "textWrapping"`, `onStart`. */
  readonly origin: string;
}

/** Receives every `UiErrorReport`. */
export type UiErrorListener = (report: UiErrorReport) => void;

const listeners = new Set<UiErrorListener>();

function describe(error: unknown) {
  const isError = error instanceof Error;
  if (isError) {
    return error.stack ?? `${error.name}: ${error.message}`;
  }

  return `Uncaught ${String(error)}`;
}

/**
 * Calls `listener` for every exception caught on the UI thread, after it is
 * written to stderr; the channel `window.onerror` is in a browser.
 *
 * @returns A function that stops the listening.
 */
export function onUiError(listener: UiErrorListener) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/**
 * Writes the exception and its stack to stderr, naming where it was caught,
 * then tells the listeners. A listener that throws is written to stderr too,
 * and the others are still told.
 */
export function reportUiError(report: UiErrorReport) {
  console.error(`[winui-svelte] ${report.origin}: ${describe(report.error)}`);
  for (const listener of listeners) {
    try {
      listener(report);
    } catch (listenerError) {
      console.error(`[winui-svelte] an error listener threw: ${describe(listenerError)}`);
    }
  }
}

function isThenable(value: unknown): value is PromiseLike<unknown> {
  return typeof value === "object" && value !== null && "then" in value && typeof value.then === "function";
}

/**
 * Wraps `callback` for native code to call: what it throws, or what a promise
 * it returns rejects with, is reported (`reportUiError`) and the caller gets
 * `undefined`.
 */
export function guarded<Args extends unknown[], Result>({ origin, callback }: {
  origin: string;
  callback: (...args: Args) => Result;
}) {
  return (...args: Args) => {
    try {
      const result = callback(...args);
      if (isThenable(result)) {
        result.then(undefined, (error: unknown) => {
          reportUiError({
            error,
            origin
          });
        });
      }

      return result;
    } catch (error) {
      reportUiError({
        error,
        origin
      });
      return undefined;
    }
  };
}
