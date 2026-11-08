import { createPointerShare } from "./pointer-share.ts";
import { DynComRawMemory } from "@microsoft/dynwinrt/com/unsafe/raw";
import {
  bind,
  bindDll,
  pointerOf,
  WIDE_CHAR_BYTES,
  wideMemory,
  withMemory
} from "#src/win32-calls.js";
import { createIconFileCalls } from "#src/win32-icons.js";
import { bringWindowToFront } from "#src/window/foreground-native.js";

/** The Shell_NotifyIcon operations. */
export const NotifyOperation = {
  add: 0,
  modify: 1,
  remove: 2,
  setVersion: 4
} as const;
/** One of `NotifyOperation`'s values. */
export type NotifyOperation = typeof NotifyOperation[keyof typeof NotifyOperation];

/** The icon in a balloon's title. */
export const BalloonIcon = {
  none: 0,
  info: 1,
  warning: 2,
  error: 3
} as const;
/** One of `BalloonIcon`'s values. */
export type BalloonIcon = typeof BalloonIcon[keyof typeof BalloonIcon];

/** How the shell tells one tray icon from another: the owner window and an id, or a GUID. */
export interface TrayIdentity {
  readonly owner: bigint;
  readonly id: number;
  readonly guid: string | null;
}

/** A balloon the shell shows over the tray icon. */
export interface Balloon {
  readonly title: string;
  readonly body: string;
  readonly icon: BalloonIcon;
  readonly isSilent: boolean;
}

/** Writes the balloon fields of a NOTIFYICONDATAW; the `balloons` extra supplies it. */
export type BalloonWriter = (options: {
  memory: DynComRawMemory;
  balloon: Balloon;
}) => void;

/** What one Shell_NotifyIcon call carries. */
export interface NotifyData {
  readonly identity: TrayIdentity;
  readonly icon: bigint;
  readonly tooltip: string;
  readonly balloon: Balloon | null;
}

/** A rectangle in screen pixels. */
export interface ScreenRect {
  readonly left: number;
  readonly top: number;
  readonly right: number;
  readonly bottom: number;
}

/** One mouse button as read by polling. */
export interface ButtonSample {
  /** Held down now. */
  readonly isDown: boolean;

  /** Pressed since the last read, even if already released (a click shorter than the poll). */
  readonly wasPressed: boolean;
}

/** The pointer and its buttons at one moment. */
export interface PointerSample {
  readonly x: number;
  readonly y: number;
  readonly left: ButtonSample;
  readonly right: ButtonSample;
  readonly middle: ButtonSample;

  /** The pointer is over the taskbar or the overflow flyout, where tray icons live. */
  readonly isOnTray: boolean;
}

/**
 * Every Win32 call the tray makes, behind one interface so the rest of the
 * tray is pure logic that a test drives with a fake. It only reads the
 * pointer and the buttons; nothing here sends input.
 */
export interface TrayNative {
  /** A hidden top-level window that owns the icon. */
  createOwnerWindow(): bigint;
  destroyWindow(hwnd: bigint): void;

  /** Loads an .ico file at `size` pixels square; 0n when it cannot. */
  loadIcon(options: {
    path: string;
    size: number;
  }): bigint;
  destroyIcon(icon: bigint): void;

  /** Pixels of a tray icon at the system scale. */
  iconSize(): number;
  notify(options: {
    operation: NotifyOperation;
    data: NotifyData;
  }): boolean;

  /** Where the shell draws the icon; null when it has none (not added, hidden, or the shell restarted). */
  iconRect(identity: TrayIdentity): ScreenRect | null;
  readPointer(): PointerSample;

  /** Leaves the pointer reading that icons of one process share; `readPointer` is not called after. */
  stopReadingPointer?(): void;

  /**
   * Makes `hwnd` the foreground window. A process that was not just given the
   * foreground (a tray click it polled for rather than received) is refused by
   * a plain SetForegroundWindow, so this joins the foreground thread's input
   * state for the call. It sends no input.
   */
  focusWindow(hwnd: bigint): void;
}

const NOTIFY_ICON_DATA_SIZE = 976;
const ICON_IDENTIFIER_SIZE = 40;
const RECT_SIZE = 16;
const TOOLTIP_CHARS = 128;
const OFFSET_SIZE = 0;
const OFFSET_OWNER = 8;
const OFFSET_ID = 16;
export const OFFSET_FLAGS = 20;
const OFFSET_IDENTIFIER_GUID = 20;
const OFFSET_CALLBACK = 24;
const OFFSET_ICON = 32;
const OFFSET_TOOLTIP = 40;
const OFFSET_VERSION = 816;
const OFFSET_GUID = 952;
const GUID_FIRST_FIELD_END = 4;
const GUID_SECOND_FIELD_END = 6;
const GUID_THIRD_FIELD_END = 8;
const GUID_LITTLE_ENDIAN_FIELDS = [
  [0, GUID_FIRST_FIELD_END],
  [GUID_FIRST_FIELD_END, GUID_SECOND_FIELD_END],
  [GUID_SECOND_FIELD_END, GUID_THIRD_FIELD_END]
] as const;
const POINT_BYTES = 8;
const RECT_RIGHT_OFFSET = 8;
const RECT_BOTTOM_OFFSET = 12;
const FLAG_MESSAGE = 0x1;
const FLAG_ICON = 0x2;
const FLAG_TIP = 0x4;
const FLAG_GUID = 0x20;
const FLAG_SHOW_TIP = 0x80;
const NOTIFY_VERSION_4 = 4;
const CALLBACK_MESSAGE = 0x8001;
const WS_POPUP = 0x80000000;
const GA_ROOT = 2;
const VK_LBUTTON = 1;
const VK_RBUTTON = 2;
const VK_MBUTTON = 4;
const KEY_DOWN_BIT = 0x8000;
const KEY_PRESSED_BIT = 0x1;
const CLASS_NAME_CHARS = 128;
const POINT_SHIFT = 32n;
const POINT_MASK = 0xFFFFFFFFn;
const DWORD_BYTES = 4;
const MONITOR_INFO_SIZE = 40;
const MONITOR_WORK_OFFSET = 20;
const MONITOR_WORK_RIGHT = 8;
const MONITOR_WORK_BOTTOM = 12;
const MONITOR_DEFAULT_TO_NEAREST = 2;
// One share per process: GetAsyncKeyState's "pressed since the last call" flag is process-wide.
const pointerShare = createPointerShare();
const TRAY_WINDOW_CLASSES: ReadonlySet<string> = new Set([
  "Shell_TrayWnd",
  "Shell_SecondaryTrayWnd",
  "NotifyIconOverflowWindow",
  "TopLevelWindowForOverflowXamlIsland"
]);

/**
 * Starts reading the cursor position, read only: the reader gives screen
 * pixels. The data transfer's `drag` event is made from it, because WinUI has
 * no such event.
 */
export function createCursorReader() {
  const getCursorPosition = bind({
    dll: "user32.dll",
    entryPoint: "GetCursorPos",
    parameters: ["pointer"],
    returnType: "i32"
  });
  const point = DynComRawMemory.allocate(POINT_BYTES, DWORD_BYTES);
  return () => {
    getCursorPosition.invoke([pointerOf(point)]);
    return {
      x: point.readI32(0),
      y: point.readI32(DWORD_BYTES)
    };
  };
}

/** Writes a fixed-size UTF-16 field, cut to leave room for the terminator. */
export function writeWide({ memory, offset, text, chars }: {
  memory: DynComRawMemory;
  offset: number;
  text: string;
  chars: number;
}) {
  const cut = text.slice(0, chars - 1);
  memory.writeBytes(offset, Buffer.from(`${cut}\0`, "utf16le"));
}

// A GUID string as the 16 bytes Windows keeps: the first three fields little endian.
function guidBytes(guid: string) {
  const bytes = Buffer.from(guid.replaceAll("-", ""), "hex");
  for (const [start, end] of GUID_LITTLE_ENDIAN_FIELDS) {
    bytes.subarray(start, end).reverse();
  }

  return bytes;
}

// NOTIFYICONDATAW (the version 4 layout) for one call.
function writeNotifyData({ memory, operation, data, writeBalloon }: {
  memory: DynComRawMemory;
  operation: NotifyOperation;
  data: NotifyData;
  writeBalloon: BalloonWriter | undefined;
}) {
  const { identity, balloon } = data;
  const guidFlag = identity.guid === null ? 0 : FLAG_GUID;
  memory.writeU32(OFFSET_SIZE, NOTIFY_ICON_DATA_SIZE);
  memory.writeU64(OFFSET_OWNER, identity.owner);
  memory.writeU32(OFFSET_ID, identity.id);
  memory.writeU32(OFFSET_FLAGS, FLAG_MESSAGE | FLAG_ICON | FLAG_TIP | FLAG_SHOW_TIP | guidFlag);
  memory.writeU32(OFFSET_CALLBACK, CALLBACK_MESSAGE);
  memory.writeU64(OFFSET_ICON, data.icon);
  writeWide({
    memory,
    offset: OFFSET_TOOLTIP,
    text: data.tooltip,
    chars: TOOLTIP_CHARS
  });
  const isVersionCall = operation === NotifyOperation.setVersion;
  if (isVersionCall) {
    memory.writeU32(OFFSET_VERSION, NOTIFY_VERSION_4);
  }

  const { guid } = identity;
  const hasGuid = guid !== null;
  if (hasGuid) {
    memory.writeBytes(OFFSET_GUID, guidBytes(guid));
  }

  const hasBalloon = balloon !== null;
  if (hasBalloon) {
    writeBalloon?.({
      memory,
      balloon
    });
  }
}

function packPoint({ x, y }: {
  x: number;
  y: number;
}) {
  return (BigInt(y) << POINT_SHIFT) | (BigInt(x) & POINT_MASK);
}

/** What the tray menu needs to place its window: the work area of a monitor. */
export interface TrayWorkArea {
  /** The work area (the display less the taskbar) of the monitor nearest the point. */
  workAreaAt(point: {
    x: number;
    y: number;
  }): ScreenRect;
}

/**
 * The Win32 call behind `workAreaAt`, bound when this is called; apart from
 * `createTrayNative`, so a tray with no window to place does not bundle it.
 */
export function createWorkAreaReader() {
  const { monitorFromPoint, monitorInfo } = bindDll({
    dll: "user32.dll",
    functions: {
      monitorFromPoint: ["MonitorFromPoint", ["i64", "u32"], "pointer"],
      monitorInfo: ["GetMonitorInfoW", ["pointer", "pointer"], "i32"]
    }
  });
  const reader: TrayWorkArea = {
    workAreaAt(point) {
      const monitor = monitorFromPoint(packPoint(point), MONITOR_DEFAULT_TO_NEAREST);
      return withMemory({
        size: MONITOR_INFO_SIZE,
        alignment: DWORD_BYTES,
        use(info) {
          info.writeU32(OFFSET_SIZE, MONITOR_INFO_SIZE);
          monitorInfo(monitor, info);
          return {
            left: info.readI32(MONITOR_WORK_OFFSET),
            top: info.readI32(MONITOR_WORK_OFFSET + DWORD_BYTES),
            right: info.readI32(MONITOR_WORK_OFFSET + MONITOR_WORK_RIGHT),
            bottom: info.readI32(MONITOR_WORK_OFFSET + MONITOR_WORK_BOTTOM)
          };
        }
      });
    }
  };
  return reader;
}

/**
 * The real Win32 calls for the tray. They are bound when this is called, never
 * when the module loads.
 */
export function createTrayNative({ writeBalloon }: { writeBalloon?: BalloonWriter | undefined } = {}) {
  const user32 = bindDll({
    dll: "user32.dll",
    functions: {
      createWindow: [
        "CreateWindowExW",
        ["u32", "pointer", "pointer", "u32", "i32", "i32", "i32", "i32", "pointer", "pointer", "pointer", "pointer"],
        "pointer"
      ],
      destroyWindow: ["DestroyWindow", ["pointer"], "i32"],
      cursorPosition: ["GetCursorPos", ["pointer"], "i32"],
      keyState: ["GetAsyncKeyState", ["i32"], "i32"],
      windowFromPoint: ["WindowFromPoint", ["i64"], "pointer"],
      ancestor: ["GetAncestor", ["pointer", "u32"], "pointer"],
      className: ["GetClassNameW", ["pointer", "pointer", "i32"], "i32"]
    }
  });
  const shell32 = bindDll({
    dll: "shell32.dll",
    functions: {
      notify: ["Shell_NotifyIconW", ["u32", "pointer"], "i32"],
      iconRect: ["Shell_NotifyIconGetRect", ["pointer", "pointer"], "i32"]
    }
  });
  const icons = createIconFileCalls();
  const pointBuffer = DynComRawMemory.allocate(POINT_BYTES, DWORD_BYTES);
  const classBuffer = DynComRawMemory.allocate(CLASS_NAME_CHARS * WIDE_CHAR_BYTES, WIDE_CHAR_BYTES);

  function readButton(key: number) {
    const state = user32.keyState(key);
    return {
      isDown: (state & KEY_DOWN_BIT) !== 0,
      wasPressed: (state & KEY_PRESSED_BIT) !== 0
    };
  }

  function isTrayWindowAt({ x, y }: {
    x: number;
    y: number;
  }) {
    const packed = packPoint({
      x,
      y
    });
    const root = user32.ancestor(user32.windowFromPoint(packed), GA_ROOT);
    user32.className(root, classBuffer, CLASS_NAME_CHARS);
    const name = classBuffer.readBytes(0, CLASS_NAME_CHARS * WIDE_CHAR_BYTES).toString("utf16le").split("\0")[0] ?? "";
    return TRAY_WINDOW_CLASSES.has(name);
  }

  function readIconRect(identity: TrayIdentity) {
    return withMemory({
      size: ICON_IDENTIFIER_SIZE,
      alignment: 8,
      use(identifier) {
        identifier.writeU32(OFFSET_SIZE, ICON_IDENTIFIER_SIZE);
        identifier.writeU64(OFFSET_OWNER, identity.owner);
        identifier.writeU32(OFFSET_ID, identity.id);

        const { guid } = identity;
        const hasGuid = guid !== null;
        if (hasGuid) {
          identifier.writeBytes(OFFSET_IDENTIFIER_GUID, guidBytes(guid));
        }

        return withMemory({
          size: RECT_SIZE,
          alignment: DWORD_BYTES,
          use(rect) {
            const isFound = shell32.iconRect(identifier, rect) === 0;
            const bounds = {
              left: rect.readI32(0),
              top: rect.readI32(DWORD_BYTES),
              right: rect.readI32(RECT_RIGHT_OFFSET),
              bottom: rect.readI32(RECT_BOTTOM_OFFSET)
            };
            const isEmpty = bounds.right <= bounds.left;
            const isUsable = isFound && !isEmpty;
            return isUsable ? bounds : null;
          }
        });
      }
    });
  }

  function readRawPointer() {
    user32.cursorPosition(pointBuffer);
    const point = {
      x: pointBuffer.readI32(0),
      y: pointBuffer.readI32(DWORD_BYTES)
    };
    return {
      ...point,
      left: readButton(VK_LBUTTON),
      right: readButton(VK_RBUTTON),
      middle: readButton(VK_MBUTTON),
      isOnTray: isTrayWindowAt(point)
    };
  }

  const sharedPointer = pointerShare.join(readRawPointer);
  const native: TrayNative = {
    createOwnerWindow() {
      const classText = wideMemory("STATIC");
      try {
        return user32.createWindow(0, classText, classText, WS_POPUP, 0, 0, 0, 0, null, null, null, null);
      } finally {
        classText.release();
      }
    },
    destroyWindow(hwnd) {
      user32.destroyWindow(hwnd);
    },
    loadIcon: icons.loadIconFile,
    destroyIcon: icons.destroyIcon,
    iconSize: icons.smallIconSize,
    notify({ operation, data }) {
      return withMemory({
        size: NOTIFY_ICON_DATA_SIZE,
        alignment: 8,
        use(memory) {
          writeNotifyData({
            memory,
            operation,
            data,
            writeBalloon
          });
          return shell32.notify(operation, memory) !== 0;
        }
      });
    },
    iconRect: readIconRect,
    readPointer: sharedPointer.read,
    stopReadingPointer: sharedPointer.stop,
    focusWindow(hwnd) {
      bringWindowToFront(hwnd);
    }
  };
  return native;
}
