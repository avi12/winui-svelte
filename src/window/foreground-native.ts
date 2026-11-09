import type { ForegroundSource } from "./foreground-filter.ts";
import { DynComRawMemory } from "@microsoft/dynwinrt/com/unsafe/raw";
import { bindDll, DWORD_BYTES, WIDE_CHAR_BYTES, wideMemory } from "#src/win32-calls.js";

// The Win32 calls behind foreground tracking. Bound when a function is called, never when the module loads.

const CLASS_NAME_CHARS = 256;
const WS_POPUP = 0x80000000;
const NO_WINDOW = 0n;
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
