import { DynWin32, DynWin32Unsafe } from "@microsoft/dynwinrt/win32/unsafe";
import { bind, numberOf, pointerOf, wideMemory } from "#src/win32-calls.js";

/** What `MessageBoxW` is given. */
export interface MessageBoxCall {
  readonly owner: bigint;
  readonly title: string;
  readonly message: string;
  readonly flags: number;
}

/**
 * The one Win32 call a notice makes, behind an interface so the rest is pure
 * logic that a test drives with a fake.
 */
export interface NoticeNative {
  /** Shows the message box and waits for it to close; the button's number, or 0 when it could not be shown. */
  messageBox(call: MessageBoxCall): number;
}

/** The real `MessageBoxW`. It is bound when this is called, never when the module loads. */
export function createNoticeNative() {
  const messageBox = bind({
    dll: "user32.dll",
    entryPoint: "MessageBoxW",
    parameters: ["pointer", "pointer", "pointer", "u32"],
    returnType: "i32"
  });
  const native: NoticeNative = {
    messageBox({ owner, title, message, flags }) {
      const text = wideMemory(message);
      const caption = wideMemory(title);
      try {
        const answer = messageBox.invoke([
          DynWin32Unsafe.pointer(owner),
          pointerOf(text),
          pointerOf(caption),
          DynWin32.u32(flags)
        ]);
        return numberOf(answer.returnValue);
      } finally {
        text.release();
        caption.release();
      }
    }
  };
  return native;
}
