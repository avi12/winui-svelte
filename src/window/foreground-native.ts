import type { ForegroundSource } from "./foreground-filter.ts";
import { DynComRawMemory } from "@microsoft/dynwinrt/com/unsafe/raw";
import { bindDll, WIDE_CHAR_BYTES, wideMemory } from "#src/win32-calls.js";

// The Win32 calls behind foreground tracking and bringing a window to the
// front. Bound when a function is called, never when the module loads.

const CLASS_NAME_CHARS = 256;
const DWORD_BYTES = 4;
const SW_RESTORE = 9;
const WS_POPUP = 0x80000000;
const ATTACH = 1;
const DETACH = 0;
const NO_WINDOW = 0n;
const NO_THREAD = 0;
const SHELL_HOOK_MESSAGE = "SHELLHOOK";
const STATIC_CLASS = "STATIC";

function bindUser32() {
  return bindDll({
    dll: "user32.dll",
    functions: {
      foreground: ["GetForegroundWindow", [], "pointer"],
      className: ["GetClassNameW", ["pointer", "pointer", "i32"], "i32"],
      threadOf: ["GetWindowThreadProcessId", ["pointer", "pointer"], "u32"],
      isWindow: ["IsWindow", ["pointer"], "i32"],
      isIconic: ["IsIconic", ["pointer"], "i32"],
      isHung: ["IsHungAppWindow", ["pointer"], "i32"],
      show: ["ShowWindow", ["pointer", "i32"], "i32"],
      attach: ["AttachThreadInput", ["u32", "u32", "i32"], "i32"],
      toTop: ["BringWindowToTop", ["pointer"], "i32"],
      setForeground: ["SetForegroundWindow", ["pointer"], "i32"],
      createWindow: [
        "CreateWindowExW",
        ["u32", "pointer", "pointer", "u32", "i32", "i32", "i32", "i32", "pointer", "pointer", "pointer", "pointer"],
        "pointer"
      ],
      destroyWindow: ["DestroyWindow", ["pointer"], "i32"],
      registerShellHook: ["RegisterShellHookWindow", ["pointer"], "i32"],
      deregisterShellHook: ["DeregisterShellHookWindow", ["pointer"], "i32"],
      registerMessage: ["RegisterWindowMessageW", ["pointer"], "u32"]
    }
  });
}

/**
 * The Windows end of `ForegroundSource`.
 *
 * @returns The source; its class and process reads share two buffers.
 */
export function createForegroundSource() {
  const user32 = bindUser32();
  const classBuffer = DynComRawMemory.allocate(CLASS_NAME_CHARS * WIDE_CHAR_BYTES, WIDE_CHAR_BYTES);
  const processBuffer = DynComRawMemory.allocate(DWORD_BYTES, DWORD_BYTES);
  return {
    foreground: user32.foreground,
    classOf(hwnd) {
      user32.className(hwnd, classBuffer, CLASS_NAME_CHARS);
      const bytes = classBuffer.readBytes(0, CLASS_NAME_CHARS * WIDE_CHAR_BYTES);
      return bytes.toString("utf16le").split("\0")[0] ?? "";
    },
    processOf(hwnd) {
      user32.threadOf(hwnd, processBuffer);
      return processBuffer.readU32(0);
    },
    isWindow(hwnd) {
      return user32.isWindow(hwnd) !== 0;
    }
  } satisfies ForegroundSource;
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
 * Asks the shell to post a message to a window of this thread each time a
 * top-level window changes (`RegisterShellHookWindow`), through a window of
 * its own that is never shown.
 *
 * @returns The window, the id of the message the shell posts and the way to
 *   stop; null when Windows refused the registration.
 */
export function startShellHook() {
  const user32 = bindUser32();
  const classText = wideMemory(STATIC_CLASS);
  const messageText = wideMemory(SHELL_HOOK_MESSAGE);
  try {
    const hwnd = user32.createWindow(0, classText, classText, WS_POPUP, 0, 0, 0, 0, null, null, null, null);
    const isRegistered = hwnd !== NO_WINDOW && user32.registerShellHook(hwnd) !== 0;
    if (!isRegistered) {
      user32.destroyWindow(hwnd);
      return null;
    }

    return {
      hwnd,
      messageId: user32.registerMessage(messageText),
      stop() {
        user32.deregisterShellHook(hwnd);
        user32.destroyWindow(hwnd);
      }
    };
  } finally {
    classText.release();
    messageText.release();
  }
}
