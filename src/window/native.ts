import type { MessageQueue, MessageSource } from "./message-pump.ts";
import { dispatchNextMessage } from "./message-pump.ts";
import { DynComRawMemory } from "@microsoft/dynwinrt/com/unsafe/raw";
import { DynWin32 } from "@microsoft/dynwinrt/win32/unsafe";
import { bind, numberOf, pointerOf } from "#src/win32-calls.js";

// The window's only flat Win32 calls: the rest is WinUI's own API.

const BASE_DPI = 96;
const OWNER_INDEX = -8;

const getDpiForWindow = bind({
  dll: "user32.dll",
  entryPoint: "GetDpiForWindow",
  parameters: ["handle"],
  returnType: "u32"
});

const setAppUserModelId = bind({
  dll: "shell32.dll",
  entryPoint: "SetCurrentProcessExplicitAppUserModelID",
  parameters: ["pointer"],
  returnType: "i32"
});

const setWindowLongPointer = bind({
  dll: "user32.dll",
  entryPoint: "SetWindowLongPtrW",
  parameters: ["handle", "i32", "i64"],
  returnType: "i64"
});

/**
 * Names the process for the taskbar and notifications: its windows then group
 * under that id (with the name and icon the app registered for it) rather than
 * under the host program (Node.js). Call it before the first window.
 */
export function joinAppUserModel(appId: string) {
  setAppUserModelId.invoke([DynWin32.wideString(appId)]);
}

/**
 * Device pixels per device-independent pixel for the window `hwnd`. AppWindow
 * sizes in physical pixels; this gives the scale before any content has
 * loaded, when XamlRoot's scale is not yet known.
 */
export function scaleOf(hwnd: bigint) {
  const dpi = numberOf(getDpiForWindow.invoke([DynWin32.handle(hwnd)]).returnValue);
  return dpi > 0 ? dpi / BASE_DPI : 1;
}

/**
 * Makes the window `owner` own the window `hwnd`: the owned window stays above
 * its owner, and closes, minimizes and restores with it.
 */
export function ownWindow({ hwnd, owner }: {
  hwnd: bigint;
  owner: bigint;
}) {
  setWindowLongPointer.invoke([DynWin32.handle(hwnd), DynWin32.i32(OWNER_INDEX), DynWin32.i64(owner)]);
}

const EXTENDED_STYLE_INDEX = -20;
const NO_STYLES = 0n;
const VIRTUAL_SCREEN_LEFT = 76;
const VIRTUAL_SCREEN_TOP = 77;
const VIRTUAL_SCREEN_WIDTH = 78;
const VIRTUAL_SCREEN_HEIGHT = 79;

const getWindowLongPointer = bind({
  dll: "user32.dll",
  entryPoint: "GetWindowLongPtrW",
  parameters: ["handle", "i32"],
  returnType: "i64"
});

const getSystemMetrics = bind({
  dll: "user32.dll",
  entryPoint: "GetSystemMetrics",
  parameters: ["i32"],
  returnType: "i32"
});

function metricOf(index: number) {
  return numberOf(getSystemMetrics.invoke([DynWin32.i32(index)]).returnValue);
}

/** The rectangle that holds every display, in virtual-screen pixels. */
export function virtualScreen() {
  return {
    left: metricOf(VIRTUAL_SCREEN_LEFT),
    top: metricOf(VIRTUAL_SCREEN_TOP),
    width: metricOf(VIRTUAL_SCREEN_WIDTH),
    height: metricOf(VIRTUAL_SCREEN_HEIGHT)
  };
}

/**
 * The extended window style bits the window chrome sets (`WS_EX_*`): a tool
 * window has no taskbar button or Alt+Tab entry, a no-activate window is never
 * activated by a click, and a transparent layered window lets clicks through.
 */
export const ExtendedStyle = {
  toolWindow: 0x80n,
  noActivate: 0x08000000n,
  transparent: 0x20n,
  layered: 0x80000n
} as const;

function extendedStylesOf(hwnd: bigint) {
  const current = getWindowLongPointer.invoke([DynWin32.handle(hwnd), DynWin32.i32(EXTENDED_STYLE_INDEX)]).returnValue;
  return current === null ? NO_STYLES : DynWin32.toBigint(current);
}

/** Turns the extended window style bits `styles` of the window `hwnd` on or off, keeping the rest. */
export function changeExtendedStyles({ hwnd, styles, isOn }: {
  hwnd: bigint;
  styles: bigint;
  isOn: boolean;
}) {
  const held = extendedStylesOf(hwnd);
  const changed = isOn ? held | styles : held & ~styles;
  setWindowLongPointer.invoke([DynWin32.handle(hwnd), DynWin32.i32(EXTENDED_STYLE_INDEX), DynWin32.i64(changed)]);
}

const MESSAGE_BYTES = 48;
const MESSAGE_ALIGNMENT = 8;
const MESSAGE_ID_OFFSET = 8;
const WM_QUIT = 0x12;
const PM_REMOVE = 1;
const QS_ALLINPUT = 0x4ff;
const MWMO_INPUTAVAILABLE = 4;
const TIMER_PERIOD_MILLISECONDS = 1;

// ContentPreTranslateMessage is exported by the Windows App SDK's
// Microsoft.UI.Windowing.Core.dll, which the bootstrapper put in the process's
// package graph: the bare name binds it, like a System32 DLL.
/** This thread's Win32 message queue, for the message pump; call it on the thread whose queue it is. */
export function createMessageSource() {
  const peekMessage = bind({
    dll: "user32.dll",
    entryPoint: "PeekMessageW",
    parameters: ["pointer", "pointer", "u32", "u32", "u32"],
    returnType: "i32"
  });
  const translateMessage = bind({
    dll: "user32.dll",
    entryPoint: "TranslateMessage",
    parameters: ["pointer"],
    returnType: "i32"
  });
  const dispatchMessage = bind({
    dll: "user32.dll",
    entryPoint: "DispatchMessageW",
    parameters: ["pointer"],
    returnType: "i64"
  });
  const waitForMessage = bind({
    dll: "user32.dll",
    entryPoint: "MsgWaitForMultipleObjectsEx",
    parameters: ["u32", "pointer", "u32", "u32", "u32"],
    returnType: "u32"
  });
  const preTranslateMessage = bind({
    dll: "Microsoft.UI.Windowing.Core.dll",
    entryPoint: "ContentPreTranslateMessage",
    parameters: ["pointer"],
    returnType: "i32"
  });
  const message = DynComRawMemory.allocate(MESSAGE_BYTES, MESSAGE_ALIGNMENT);
  const messagePointer = pointerOf(message);
  const noPointer = pointerOf(null);
  const none = DynWin32.u32(0);
  const removeFromQueue = DynWin32.u32(PM_REMOVE);
  const anyInput = DynWin32.u32(QS_ALLINPUT);
  const inputAvailable = DynWin32.u32(MWMO_INPUTAVAILABLE);
  const queue = {
    take() {
      const found = peekMessage.invoke([messagePointer, noPointer, none, none, removeFromQueue]).returnValue;
      return numberOf(found) !== 0;
    },
    isQuit() {
      return message.readI32(MESSAGE_ID_OFFSET) === WM_QUIT;
    },
    isConsumedByContent() {
      return numberOf(preTranslateMessage.invoke([messagePointer]).returnValue) !== 0;
    },
    deliver() {
      translateMessage.invoke([messagePointer]);
      dispatchMessage.invoke([messagePointer]);
    }
  } satisfies MessageQueue;
  return {
    dispatchNext() {
      return dispatchNextMessage(queue);
    },
    wait(milliseconds: number) {
      waitForMessage.invoke([none, noPointer, DynWin32.u32(milliseconds), anyInput, inputAvailable]);
    }
  } satisfies MessageSource;
}

/**
 * Asks Windows for 1 ms timer ticks and returns what gives them back. Without
 * it every wait the pump does and every timer rounds up to a tick of about
 * 15.6 ms; browsers ask for the same while a page is visible.
 */
export function requestFineTimerResolution() {
  const begin = bind({
    dll: "winmm.dll",
    entryPoint: "timeBeginPeriod",
    parameters: ["u32"],
    returnType: "u32"
  });
  const end = bind({
    dll: "winmm.dll",
    entryPoint: "timeEndPeriod",
    parameters: ["u32"],
    returnType: "u32"
  });
  begin.invoke([DynWin32.u32(TIMER_PERIOD_MILLISECONDS)]);
  return () => {
    end.invoke([DynWin32.u32(TIMER_PERIOD_MILLISECONDS)]);
  };
}
