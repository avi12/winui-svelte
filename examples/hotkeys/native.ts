import { DynWin32 } from "@microsoft/dynwinrt/win32/unsafe";
import { bind, numberOf } from "#src/win32-calls.js";

const WM_HOTKEY = 0x312;
const NO_LPARAM = 0n;

// Posts the message Windows posts when a registered combination is pressed, to
// this thread's own queue, the one the pump reads: no key is pressed and no
// input is injected.
export function postHotkey(id: number) {
  const currentThread = bind({
    dll: "kernel32.dll",
    entryPoint: "GetCurrentThreadId",
    parameters: [],
    returnType: "u32"
  });
  const postThreadMessage = bind({
    dll: "user32.dll",
    entryPoint: "PostThreadMessageW",
    parameters: ["u32", "u32", "u64", "i64"],
    returnType: "i32"
  });
  const thread = numberOf(currentThread.invoke([]).returnValue);
  postThreadMessage.invoke([
    DynWin32.u32(thread),
    DynWin32.u32(WM_HOTKEY),
    DynWin32.u64(BigInt(id)),
    DynWin32.i64(NO_LPARAM)
  ]);
}
