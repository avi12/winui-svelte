import { readWindowText } from "./text.ts";
import type { ReadWindowTextOptions, WindowText } from "./text.ts";
import { withUiaClient } from "./with-client.ts";
import { DynCom } from "@microsoft/dynwinrt/com/unsafe";
import { bindDll } from "#src/win32-calls.js";
import { parentPort } from "node:worker_threads";

const MULTITHREADED_APARTMENT = 0;

/** Which window to read. */
export const UiaTarget = {
  foreground: "foreground",
  focused: "focused"
} as const;

/** The foreground window, the window of the focused element, or the window with this handle. */
export type UiaTargetSpec = typeof UiaTarget[keyof typeof UiaTarget] | { readonly hwnd: bigint };

/** What the host asks of the worker. */
export interface UiaWorkerRequest extends ReadWindowTextOptions {
  readonly id: number;
  readonly target: UiaTargetSpec;

  /** A window of this process is not read (the app itself). */
  readonly excludeProcessId?: number;
}

/** What the worker answers. */
export type UiaWorkerResponse =
  | {
    readonly id: number;
    readonly text: WindowText | null;
  }
  | {
    readonly id: number;
    readonly error: string;
  };

/**
 * Reads one request inside a UI Automation client, on the calling thread.
 *
 * @param request - The window and the limits.
 * @returns The text, or null when there is no window to read or it is the excluded process's.
 */
function readTarget({ target, excludeProcessId, ...limits }: Omit<UiaWorkerRequest, "id">) {
  const user32 = bindDll({
    dll: "user32.dll",
    functions: {
      foregroundWindow: ["GetForegroundWindow", [], "pointer"]
    }
  });
  return withUiaClient(client => {
    const isFocused = target === UiaTarget.focused;
    const isWindow = typeof target === "object";
    const root = isFocused
      ? client.focusedElement()
      : client.elementFromHandle(isWindow ? target.hwnd : user32.foregroundWindow());
    const isRootNull = root === null;
    if (isRootNull) {
      return null;
    }

    const isExcluded = excludeProcessId !== undefined && root.properties().processId === excludeProcessId;
    if (isExcluded) {
      return null;
    }

    return readWindowText({
      client,
      root,
      ...limits
    });
  });
}

/**
 * The body of the UI Automation worker: joins the multithreaded apartment and
 * answers each request on the parent port. The host starts it; an app does not
 * call it.
 */
export function runUiaWorker() {
  DynCom.initialize(MULTITHREADED_APARTMENT);
  parentPort?.on("message", async ({ id, ...request }: UiaWorkerRequest) => {
    try {
      const text = await readTarget(request);
      parentPort?.postMessage({
        id,
        text
      } satisfies UiaWorkerResponse);
    } catch (error) {
      parentPort?.postMessage({
        id,
        error: error instanceof Error ? error.message : String(error)
      } satisfies UiaWorkerResponse);
    }
  });
}
