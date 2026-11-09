import { bindDll } from "#src/win32-calls.js";

// Bringing a window to the front, apart from the window runtime: a tray-only
// process takes the foreground for its menu without bundling any of window/.
// Bound when the function is called, never when the module loads.

const SW_RESTORE = 9;
const ATTACH = 1;
const DETACH = 0;
const NO_WINDOW = 0n;
const NO_THREAD = 0;
const ASFW_ANY = 0xFFFFFFFF;

/** The user32 rows every foreground call shares: which window is in front, whose it is, whether it still exists. */
export const FOREGROUND_QUERY_CALLS = {
  foreground: ["GetForegroundWindow", [], "pointer"],
  threadOf: ["GetWindowThreadProcessId", ["pointer", "pointer"], "u32"],
  isWindow: ["IsWindow", ["pointer"], "i32"]
} as const;

function bindUser32() {
  return bindDll({
    dll: "user32.dll",
    functions: {
      ...FOREGROUND_QUERY_CALLS,
      isIconic: ["IsIconic", ["pointer"], "i32"],
      isHung: ["IsHungAppWindow", ["pointer"], "i32"],
      show: ["ShowWindow", ["pointer", "i32"], "i32"],
      attach: ["AttachThreadInput", ["u32", "u32", "i32"], "i32"],
      toTop: ["BringWindowToTop", ["pointer"], "i32"],
      setForeground: ["SetForegroundWindow", ["pointer"], "i32"],
      allow: ["AllowSetForegroundWindow", ["u32"], "i32"]
    }
  });
}

/**
 * Makes `hwnd` the foreground window, the way a window the user is not typing
 * in can take it: this thread is joined to the foreground thread's input for
 * the two calls, because the key releases of a hotkey went to the app in
 * front and Windows' foreground lock refuses a plain `SetForegroundWindow`.
 * It sends no input. A minimized window is restored first. Best effort:
 * Windows still refuses for a foreground window of a higher integrity level or
 * a hung one.
 *
 * @param hwnd - The window to bring to the front.
 * @returns True when the window ended in front.
 */
export function bringWindowToFront(hwnd: bigint) {
  const user32 = bindUser32();
  const { currentThread } = bindDll({
    dll: "kernel32.dll",
    functions: {
      currentThread: ["GetCurrentThreadId", [], "u32"]
    }
  });
  const isGone = user32.isWindow(hwnd) === 0;
  if (isGone) {
    return false;
  }

  const isMinimized = user32.isIconic(hwnd) !== 0;
  if (isMinimized) {
    user32.show(hwnd, SW_RESTORE);
  }

  const inFront = user32.foreground();
  const isFrontUsable = inFront !== NO_WINDOW && user32.isHung(inFront) === 0;
  const foregroundThread = isFrontUsable ? user32.threadOf(inFront, null) : NO_THREAD;
  const ownThread = currentThread();
  const isOtherThread = foregroundThread !== NO_THREAD && foregroundThread !== ownThread;
  const isJoined = isOtherThread && user32.attach(ownThread, foregroundThread, ATTACH) !== 0;
  try {
    user32.toTop(hwnd);
    user32.setForeground(hwnd);
  } finally {
    if (isJoined) {
      user32.attach(ownThread, foregroundThread, DETACH);
    }
  }

  return user32.foreground() === hwnd;
}

/**
 * Lets another process take the foreground: `AllowSetForegroundWindow`. Windows
 * refuses a process's `SetForegroundWindow` unless the foreground process
 * allowed it, so the process that just received the user's click (a tray's
 * menu pick) calls this before it starts or signals the process that shows the
 * window. The right lasts until the next input event. It works only for a
 * process that itself may take the foreground, and does nothing otherwise.
 *
 * @param options - The process to allow, or any process when left out.
 * @returns True when Windows took the grant.
 */
export function allowForeground({ processId = ASFW_ANY }: {
  processId?: number;
} = {}) {
  return bindUser32().allow(processId) !== 0;
}
