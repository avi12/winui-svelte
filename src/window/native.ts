import type { HostExitRequest } from "./host-exit.ts";
import type { LibuvWake } from "./libuv-wake.ts";
import type { MessageQueue, MessageSource } from "./message-pump.ts";
import { dispatchNextMessage } from "./message-pump.ts";
import { DynComRawMemory } from "@microsoft/dynwinrt/com/unsafe/raw";
import { DynWin32, DynWin32Unsafe } from "@microsoft/dynwinrt/win32/unsafe";
import {
  addressOf,
  bind,
  numberOf,
  pointerOf,
  wideMemory,
  withMemory
} from "#src/win32-calls.js";

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
const HANDLE_BYTES = 8;
const WAIT_FAILED = 0xffffffff;
const WAIT_OBJECT_0 = 0;
const TIMER_PERIOD_MILLISECONDS = 1;

// ContentPreTranslateMessage is exported by the Windows App SDK's
// Microsoft.UI.Windowing.Core.dll, which the bootstrapper put in the process's
// package graph: the bare name binds it, like a System32 DLL.
/** This thread's Win32 message queue, for the message pump; call it on the thread whose queue it is. */
export function createMessageSource({ wake, hostExit }: {
  wake?: LibuvWake | undefined;
  hostExit?: HostExitRequest | undefined;
} = {}) {
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
  const events = [wake?.event, hostExit?.event].filter(event => event !== undefined);
  const wakeHandles = DynComRawMemory.allocate(HANDLE_BYTES * 2, HANDLE_BYTES);
  for (const [iEvent, event] of events.entries()) {
    wakeHandles.writeU64(iEvent * HANDLE_BYTES, event);
  }

  const hasEvents = events.length > 0;
  const handleCount = DynWin32.u32(events.length);
  const hostExitResult = (wake === undefined ? 0 : 1) + WAIT_OBJECT_0;
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
      wake?.arm();
      // Read through the closure on every call: the memory is freed when its wrapper is collected.
      const handlesPointer = hasEvents ? pointerOf(wakeHandles) : noPointer;
      const timeout = DynWin32.u32(milliseconds);
      const result = waitForMessage.invoke([handleCount, handlesPointer, timeout, anyInput, inputAvailable]);
      const waited = numberOf(result.returnValue);
      const hasFailed = waited === WAIT_FAILED;
      if (hasFailed) {
        waitForMessage.invoke([none, noPointer, timeout, anyInput, inputAvailable]);
      }

      wake?.disarm();
      const isExitRequested = hostExit !== undefined && waited === hostExitResult;
      if (isExitRequested) {
        hostExit.onRequest();
      }
    },
    idleMilliseconds: wake?.idleMilliseconds
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

const LOOP_OFFSET = 8;
const IOCP_OFFSET = 56;
const POINTER_BYTES = 8;
const POINTER_ALIGNMENT = 8;
const OBJECT_TYPE_BUFFER_BYTES = 256;
const OBJECT_TYPE_NAME_LENGTH_OFFSET = 0;
const OBJECT_TYPE_NAME_POINTER_OFFSET = 8;
const OBJECT_TYPE_INFORMATION = 2;
const IO_COMPLETION_TYPE = "IoCompletion";

function readPointer({ address, scratch, copyMemory }: {
  address: bigint;
  scratch: DynComRawMemory;
  copyMemory: ReturnType<typeof bind>;
}) {
  copyMemory.invoke([pointerOf(scratch), DynWin32Unsafe.pointer(address), DynWin32.u64(BigInt(POINTER_BYTES))]);
  return scratch.readU64(0);
}

function objectTypeOf({ handle, queryObject }: {
  handle: bigint;
  queryObject: ReturnType<typeof bind>;
}) {
  return withMemory({
    size: OBJECT_TYPE_BUFFER_BYTES,
    alignment: POINTER_ALIGNMENT,
    use(buffer) {
      const status = numberOf(
        queryObject.invoke([
          DynWin32Unsafe.pointer(handle),
          DynWin32.u32(OBJECT_TYPE_INFORMATION),
          pointerOf(buffer),
          DynWin32.u32(OBJECT_TYPE_BUFFER_BYTES),
          pointerOf(null)
        ]).returnValue
      );
      const isFailed = status < 0;
      if (isFailed) {
        return "";
      }

      // The name's characters follow the structure inside the same buffer.
      const bytes = buffer.readU16(OBJECT_TYPE_NAME_LENGTH_OFFSET);
      const textOffset = buffer.readU64(OBJECT_TYPE_NAME_POINTER_OFFSET) - buffer.pointer().address;
      return buffer.readBytes(textOffset, bytes).toString("utf16le");
    }
  });
}

/**
 * The I/O completion port of this thread's libuv loop, found through the
 * address of one of its handles that Node's diagnostic report lists (a handle's
 * second pointer is its loop, and the port the first private field after the
 * loop's public ones, libuv 1.x on Windows); undefined when what is found is
 * not such a port. Costs a diagnostic report, about 40 ms.
 */
export function findLoopCompletionPort() {
  Object.assign(process.report, {
    excludeNetwork: true,
    excludeEnv: true
  });
  const report: unknown = process.report.getReport();
  const reported = reportedHandleAddress(report);
  const isMissing = reported === undefined;
  if (isMissing) {
    return undefined;
  }

  const copyMemory = bind({
    dll: "kernel32.dll",
    entryPoint: "RtlMoveMemory",
    parameters: ["pointer", "pointer", "u64"],
    returnType: "i32"
  });
  const queryObject = bind({
    dll: "ntdll.dll",
    entryPoint: "NtQueryObject",
    parameters: ["pointer", "u32", "pointer", "u32", "pointer"],
    returnType: "i32"
  });
  const scratch = DynComRawMemory.allocate(POINTER_BYTES, POINTER_ALIGNMENT);
  try {
    const loop = readPointer({
      address: BigInt(reported) + BigInt(LOOP_OFFSET),
      scratch,
      copyMemory
    });
    const iocp = readPointer({
      address: loop + BigInt(IOCP_OFFSET),
      scratch,
      copyMemory
    });
    const isPort = objectTypeOf({
      handle: iocp,
      queryObject
    }) === IO_COMPLETION_TYPE;
    return isPort ? iocp : undefined;
  } finally {
    scratch.release();
  }
}

interface ReportedHandle {
  address: string;
}

function isReportedHandle(value: unknown): value is ReportedHandle {
  return typeof value === "object" && value !== null && "address" in value && typeof value.address === "string";
}

function reportedHandleAddress(report: unknown) {
  const hasLibuv = typeof report === "object" && report !== null && "libuv" in report;
  const libuv: unknown = hasLibuv ? report.libuv : undefined;
  const handles: unknown[] = Array.isArray(libuv) ? libuv : [];
  return handles.find(isReportedHandle)?.address;
}

const EVENT_ALL_ACCESS = 0x1f0003;

/**
 * An event of this process, manual-reset unless `isAutoReset`; named, it is
 * visible to every thread by that name, and unnamed (`name` null) only by the
 * handle. Lives as long as the process.
 */
export function createNamedEvent({ name, isSet, isAutoReset }: {
  name: string | null;
  isSet: boolean;
  isAutoReset: boolean;
}) {
  const create = bind({
    dll: "kernel32.dll",
    entryPoint: "CreateEventW",
    parameters: ["pointer", "i32", "i32", "pointer"],
    returnType: "pointer"
  });
  const text = name === null ? null : wideMemory(name);
  try {
    const created = create.invoke([
      pointerOf(null),
      DynWin32.i32(isAutoReset ? 0 : 1),
      DynWin32.i32(isSet ? 1 : 0),
      pointerOf(text)
    ]).returnValue;
    return addressOf(created);
  } finally {
    text?.release();
  }
}

/** The named event `name` if some thread of this process made it; 0n when none did. */
export function openNamedEvent(name: string) {
  const open = bind({
    dll: "kernel32.dll",
    entryPoint: "OpenEventW",
    parameters: ["u32", "i32", "pointer"],
    returnType: "pointer"
  });
  const text = wideMemory(name);
  try {
    return addressOf(open.invoke([DynWin32.u32(EVENT_ALL_ACCESS), DynWin32.i32(0), pointerOf(text)]).returnValue);
  } finally {
    text.release();
  }
}

/** Signals (`isSet`) or clears the event. */
export function changeEvent({ event, isSet }: {
  event: bigint;
  isSet: boolean;
}) {
  const change = bind({
    dll: "kernel32.dll",
    entryPoint: isSet ? "SetEvent" : "ResetEvent",
    parameters: ["pointer"],
    returnType: "i32"
  });
  change.invoke([DynWin32Unsafe.pointer(event)]);
}

/** Waits for the event; true when it is signalled. */
export function waitForEvent({ event, milliseconds }: {
  event: bigint;
  milliseconds: number;
}) {
  const wait = bind({
    dll: "kernel32.dll",
    entryPoint: "WaitForSingleObject",
    parameters: ["pointer", "u32"],
    returnType: "u32"
  });
  const result = wait.invoke([DynWin32Unsafe.pointer(event), DynWin32.u32(milliseconds)]).returnValue;
  return numberOf(result) === WAIT_OBJECT_0;
}
