import type { MessageQueue, MessageSource } from "./message-pump.ts";
import { dispatchNextMessage } from "./message-pump.ts";
import { DynComRawMemory } from "@microsoft/dynwinrt/com/unsafe/raw";
import { DynWin32, DynWin32Unsafe } from "@microsoft/dynwinrt/win32/unsafe";
import { bind, numberOf, pointerOf, withMemory } from "#src/win32-calls.js";

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
const UNSIGNED_BITS = 64;
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

/** Whether the window `hwnd` has every extended style bit of `styles` on. */
export function hasExtendedStyles({ hwnd, styles }: {
  hwnd: bigint;
  styles: bigint;
}) {
  return (extendedStylesOf(hwnd) & styles) === styles;
}

/** Turns the extended window style bits `styles` of the window `hwnd` on or off, keeping the rest. */
export function changeExtendedStyles({ hwnd, styles, isOn }: {
  hwnd: bigint;
  styles: bigint;
  isOn: boolean;
}) {
  const held = extendedStylesOf(hwnd);
  const changed = isOn ? held | styles : BigInt.asUintN(UNSIGNED_BITS, held & ~styles);
  setWindowLongPointer.invoke([DynWin32.handle(hwnd), DynWin32.i32(EXTENDED_STYLE_INDEX), DynWin32.i64(changed)]);
}

const WDA_NONE = 0;
const WDA_EXCLUDEFROMCAPTURE = 0x11;
const LWA_ALPHA = 2;
const OPAQUE = 255;
const NO_COLOR_KEY = 0;
const REDRAW = 1;
const DISPLAY_AFFINITY_BYTES = 4;
const DISPLAY_AFFINITY_ALIGNMENT = 4;
const RECT_BYTES = 16;
const RECT_LEFT_OFFSET = 0;
const RECT_TOP_OFFSET = 4;
const RECT_RIGHT_OFFSET = 8;
const RECT_BOTTOM_OFFSET = 12;
const RECT_ALIGNMENT = 4;

const setWindowDisplayAffinity = bind({
  dll: "user32.dll",
  entryPoint: "SetWindowDisplayAffinity",
  parameters: ["handle", "u32"],
  returnType: "i32"
});

const getWindowDisplayAffinity = bind({
  dll: "user32.dll",
  entryPoint: "GetWindowDisplayAffinity",
  parameters: ["handle", "pointer"],
  returnType: "i32"
});

const setLayeredWindowAttributes = bind({
  dll: "user32.dll",
  entryPoint: "SetLayeredWindowAttributes",
  parameters: ["handle", "u32", "u32", "u32"],
  returnType: "i32"
});

const createRoundRectRegion = bind({
  dll: "gdi32.dll",
  entryPoint: "CreateRoundRectRgn",
  parameters: ["i32", "i32", "i32", "i32", "i32", "i32"],
  returnType: "i64"
});

const setWindowRegion = bind({
  dll: "user32.dll",
  entryPoint: "SetWindowRgn",
  parameters: ["handle", "pointer", "i32"],
  returnType: "i32"
});

const getWindowRegionBox = bind({
  dll: "user32.dll",
  entryPoint: "GetWindowRgnBox",
  parameters: ["handle", "pointer"],
  returnType: "i32"
});

/**
 * Keeps the window `hwnd` out of screenshots, screen recordings and screen
 * sharing (it shows as black or not at all there), or puts it back in.
 */
export function excludeFromCapture({ hwnd, isExcluded }: {
  hwnd: bigint;
  isExcluded: boolean;
}) {
  const affinity = isExcluded ? WDA_EXCLUDEFROMCAPTURE : WDA_NONE;
  setWindowDisplayAffinity.invoke([DynWin32.handle(hwnd), DynWin32.u32(affinity)]);
}

/** Whether the window `hwnd` is kept out of screen capture. */
export function isExcludedFromCapture(hwnd: bigint) {
  return withMemory({
    size: DISPLAY_AFFINITY_BYTES,
    alignment: DISPLAY_AFFINITY_ALIGNMENT,
    use(memory) {
      getWindowDisplayAffinity.invoke([DynWin32.handle(hwnd), pointerOf(memory)]);
      return memory.readU32(0) === WDA_EXCLUDEFROMCAPTURE;
    }
  });
}

/**
 * Makes the window `hwnd` a layered window that is fully opaque: what a
 * click-through window needs, since the transparent style lets clicks pass
 * only for a layered window.
 */
export function makeLayeredOpaque(hwnd: bigint) {
  changeExtendedStyles({
    hwnd,
    styles: ExtendedStyle.layered,
    isOn: true
  });
  setLayeredWindowAttributes.invoke([
    DynWin32.handle(hwnd),
    DynWin32.u32(NO_COLOR_KEY),
    DynWin32.u32(OPAQUE),
    DynWin32.u32(LWA_ALPHA)
  ]);
}

/**
 * Clips the window `hwnd` to a rounded rectangle of `width` by `height` device
 * pixels with corners of `radius`; what is outside shows the desktop and takes
 * no clicks. The edge is not anti-aliased.
 */
export function clipToRoundedRectangle({ hwnd, width, height, radius }: {
  hwnd: bigint;
  width: number;
  height: number;
  radius: number;
}) {
  const diameter = radius * 2;
  const created = createRoundRectRegion.invoke([
    DynWin32.i32(0),
    DynWin32.i32(0),
    DynWin32.i32(width + 1),
    DynWin32.i32(height + 1),
    DynWin32.i32(diameter),
    DynWin32.i32(diameter)
  ]).returnValue;
  const isCreated = created !== null;
  if (!isCreated) {
    return;
  }

  // The system owns the region once it is set.
  const region = DynWin32Unsafe.pointer(BigInt.asUintN(UNSIGNED_BITS, DynWin32.toBigint(created)));
  setWindowRegion.invoke([DynWin32.handle(hwnd), region, DynWin32.i32(REDRAW)]);
}

/** Takes the clip of `clipToRoundedRectangle` away: the window is whole again. */
export function clearWindowClip(hwnd: bigint) {
  setWindowRegion.invoke([DynWin32.handle(hwnd), DynWin32Unsafe.pointer(null), DynWin32.i32(REDRAW)]);
}

/** The size of the window `hwnd`'s clip in device pixels; null when it has none. */
export function clipSizeOf(hwnd: bigint) {
  return withMemory({
    size: RECT_BYTES,
    alignment: RECT_ALIGNMENT,
    use(memory) {
      const kind = numberOf(getWindowRegionBox.invoke([DynWin32.handle(hwnd), pointerOf(memory)]).returnValue);
      const isClipped = kind > 0;
      if (!isClipped) {
        return null;
      }

      return {
        width: memory.readI32(RECT_RIGHT_OFFSET) - memory.readI32(RECT_LEFT_OFFSET),
        height: memory.readI32(RECT_BOTTOM_OFFSET) - memory.readI32(RECT_TOP_OFFSET)
      };
    }
  });
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
