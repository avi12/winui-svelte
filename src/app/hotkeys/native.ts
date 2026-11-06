import type { HotkeyWin32 } from "./registry.ts";
import { DynWin32, DynWin32Unsafe } from "@microsoft/dynwinrt/win32/unsafe";
import { bind, numberOf } from "#src/win32-calls.js";

/** `RegisterHotKey` and `UnregisterHotKey` for the calling thread's queue (no window: `hWnd` is null). */
export function createHotkeyWin32() {
  const registerHotKey = bind({
    dll: "user32.dll",
    entryPoint: "RegisterHotKey",
    parameters: ["pointer", "i32", "u32", "u32"],
    returnType: "i32",
    shouldCaptureLastError: true
  });
  const unregisterHotKey = bind({
    dll: "user32.dll",
    entryPoint: "UnregisterHotKey",
    parameters: ["pointer", "i32"],
    returnType: "i32"
  });
  const noWindow = DynWin32Unsafe.pointer(null);
  return {
    register({ id, modifierFlags, virtualKey }) {
      const result = registerHotKey.invoke([
        noWindow,
        DynWin32.i32(id),
        DynWin32.u32(modifierFlags),
        DynWin32.u32(virtualKey)
      ]);
      const isRegistered = numberOf(result.returnValue) !== 0;
      return isRegistered ? null : result.lastError ?? 0;
    },
    unregister(id) {
      unregisterHotKey.invoke([noWindow, DynWin32.i32(id)]);
    }
  } satisfies HotkeyWin32;
}
