import { DynComRawMemory } from "@microsoft/dynwinrt/com/unsafe/raw";
import { DynWin32, DynWin32Unsafe } from "@microsoft/dynwinrt/win32/unsafe";
import {
  addressOf,
  bind,
  bindDll,
  numberOf,
  pointerOf,
  WIDE_CHAR_BYTES,
  wideMemory,
  withMemory
} from "#src/win32-calls.js";
import { createIconFileCalls } from "#src/win32-icons.js";

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
  isTaskbarLight(): boolean;

  /** The work area (the display less the taskbar) of the monitor nearest the point. */
  workAreaAt(point: {
    x: number;
    y: number;
  }): ScreenRect;

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
const BALLOON_BODY_CHARS = 256;
const BALLOON_TITLE_CHARS = 64;
const OFFSET_SIZE = 0;
const OFFSET_OWNER = 8;
const OFFSET_ID = 16;
const OFFSET_FLAGS = 20;
const OFFSET_IDENTIFIER_GUID = 20;
const OFFSET_CALLBACK = 24;
const OFFSET_ICON = 32;
const OFFSET_TOOLTIP = 40;
const OFFSET_BODY = 304;
const OFFSET_VERSION = 816;
const OFFSET_TITLE = 820;
const OFFSET_BALLOON_FLAGS = 948;
const OFFSET_GUID = 952;
const GUID_BYTES = 16;
const GUID_FIRST_FIELD_END = 4;
const GUID_SECOND_FIELD_END = 6;
const GUID_THIRD_FIELD_END = 8;
const POINT_BYTES = 8;
const RECT_RIGHT_OFFSET = 8;
const RECT_BOTTOM_OFFSET = 12;
const FLAG_MESSAGE = 0x1;
const FLAG_ICON = 0x2;
const FLAG_TIP = 0x4;
const FLAG_INFO = 0x10;
const FLAG_GUID = 0x20;
const FLAG_SHOW_TIP = 0x80;
const BALLOON_SILENT = 0x10;
const NOTIFY_VERSION_4 = 4;
const CALLBACK_MESSAGE = 0x8001;
const WS_POPUP = 0x80000000;
const GA_ROOT = 2;
const VK_LBUTTON = 1;
const VK_RBUTTON = 2;
const VK_MBUTTON = 4;
const KEY_DOWN_BIT = 0x8000;
const KEY_PRESSED_BIT = 0x1;
const HKEY_CURRENT_USER = 0x80000001n;
const REG_DWORD_ONLY = 0x10;
const CLASS_NAME_CHARS = 128;
const POINT_SHIFT = 32n;
const POINT_MASK = 0xFFFFFFFFn;
const DWORD_BYTES = 4;
const MONITOR_INFO_SIZE = 40;
const MONITOR_WORK_OFFSET = 20;
const MONITOR_WORK_RIGHT = 8;
const MONITOR_WORK_BOTTOM = 12;
const MONITOR_DEFAULT_TO_NEAREST = 2;
const TRAY_WINDOW_CLASSES: ReadonlySet<string> = new Set([
  "Shell_TrayWnd",
  "Shell_SecondaryTrayWnd",
  "NotifyIconOverflowWindow",
  "TopLevelWindowForOverflowXamlIsland"
]);
const PERSONALIZE_KEY = String.raw`Software\Microsoft\Windows\CurrentVersion\Themes\Personalize`;
const LIGHT_THEME_VALUE = "SystemUsesLightTheme";

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

// A fixed-size UTF-16 field, cut to leave room for the terminator.
function writeWide({ memory, offset, text, chars }: {
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
  const hex = Buffer.from(guid.replaceAll("-", ""), "hex");
  return Buffer.concat([
    Buffer.from(hex.subarray(0, GUID_FIRST_FIELD_END)).reverse(),
    Buffer.from(hex.subarray(GUID_FIRST_FIELD_END, GUID_SECOND_FIELD_END)).reverse(),
    Buffer.from(hex.subarray(GUID_SECOND_FIELD_END, GUID_THIRD_FIELD_END)).reverse(),
    hex.subarray(GUID_THIRD_FIELD_END, GUID_BYTES)
  ]);
}

// NOTIFYICONDATAW (the version 4 layout) for one call.
function writeNotifyData({ memory, operation, data }: {
  memory: DynComRawMemory;
  operation: NotifyOperation;
  data: NotifyData;
}) {
  const { identity, balloon } = data;
  const guidFlag = identity.guid === null ? 0 : FLAG_GUID;
  const infoFlag = balloon === null ? 0 : FLAG_INFO;
  memory.writeU32(OFFSET_SIZE, NOTIFY_ICON_DATA_SIZE);
  memory.writeU64(OFFSET_OWNER, identity.owner);
  memory.writeU32(OFFSET_ID, identity.id);
  memory.writeU32(OFFSET_FLAGS, FLAG_MESSAGE | FLAG_ICON | FLAG_TIP | FLAG_SHOW_TIP | infoFlag | guidFlag);
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
  if (!hasBalloon) {
    return;
  }

  writeWide({
    memory,
    offset: OFFSET_BODY,
    text: balloon.body,
    chars: BALLOON_BODY_CHARS
  });
  writeWide({
    memory,
    offset: OFFSET_TITLE,
    text: balloon.title,
    chars: BALLOON_TITLE_CHARS
  });
  memory.writeU32(OFFSET_BALLOON_FLAGS, balloon.icon | (balloon.isSilent ? BALLOON_SILENT : 0));
}

/**
 * The real Win32 calls for the tray. They are bound when this is called, never
 * when the module loads.
 */
export function createTrayNative() {
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
      className: ["GetClassNameW", ["pointer", "pointer", "i32"], "i32"],
      monitorFromPoint: ["MonitorFromPoint", ["i64", "u32"], "pointer"],
      monitorInfo: ["GetMonitorInfoW", ["pointer", "pointer"], "i32"],
      foregroundWindow: ["GetForegroundWindow", [], "pointer"],
      windowThread: ["GetWindowThreadProcessId", ["pointer", "pointer"], "u32"],
      attachInput: ["AttachThreadInput", ["u32", "u32", "i32"], "i32"],
      setForeground: ["SetForegroundWindow", ["pointer"], "i32"]
    }
  });
  const shell32 = bindDll({
    dll: "shell32.dll",
    functions: {
      notify: ["Shell_NotifyIconW", ["u32", "pointer"], "i32"],
      iconRect: ["Shell_NotifyIconGetRect", ["pointer", "pointer"], "i32"]
    }
  });
  const { registryValue } = bindDll({
    dll: "advapi32.dll",
    functions: {
      registryValue: ["RegGetValueW", ["pointer", "pointer", "pointer", "u32", "pointer", "pointer", "pointer"], "i32"]
    }
  });
  const { currentThread } = bindDll({
    dll: "kernel32.dll",
    functions: {
      currentThread: ["GetCurrentThreadId", [], "u32"]
    }
  });
  const icons = createIconFileCalls();
  const pointBuffer = DynComRawMemory.allocate(POINT_BYTES, DWORD_BYTES);
  const classBuffer = DynComRawMemory.allocate(CLASS_NAME_CHARS * WIDE_CHAR_BYTES, WIDE_CHAR_BYTES);

  function readButton(key: number) {
    const state = numberOf(user32.keyState.invoke([DynWin32.i32(key)]).returnValue);
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
    const window = addressOf(user32.windowFromPoint.invoke([DynWin32.i64(packed)]).returnValue);
    const root = addressOf(user32.ancestor.invoke([DynWin32Unsafe.pointer(window), DynWin32.u32(GA_ROOT)]).returnValue);
    user32.className.invoke([DynWin32Unsafe.pointer(root), pointerOf(classBuffer), DynWin32.i32(CLASS_NAME_CHARS)]);
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
            const result = shell32.iconRect.invoke([pointerOf(identifier), pointerOf(rect)]);
            const isFound = numberOf(result.returnValue) === 0;
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

  function packPoint({ x, y }: {
    x: number;
    y: number;
  }) {
    return (BigInt(y) << POINT_SHIFT) | (BigInt(x) & POINT_MASK);
  }

  function readWorkArea(point: {
    x: number;
    y: number;
  }) {
    const found = user32.monitorFromPoint.invoke([
      DynWin32.i64(packPoint(point)),
      DynWin32.u32(MONITOR_DEFAULT_TO_NEAREST)
    ]);
    const monitor = addressOf(found.returnValue);
    return withMemory({
      size: MONITOR_INFO_SIZE,
      alignment: DWORD_BYTES,
      use(info) {
        info.writeU32(OFFSET_SIZE, MONITOR_INFO_SIZE);
        user32.monitorInfo.invoke([DynWin32Unsafe.pointer(monitor), pointerOf(info)]);
        return {
          left: info.readI32(MONITOR_WORK_OFFSET),
          top: info.readI32(MONITOR_WORK_OFFSET + DWORD_BYTES),
          right: info.readI32(MONITOR_WORK_OFFSET + MONITOR_WORK_RIGHT),
          bottom: info.readI32(MONITOR_WORK_OFFSET + MONITOR_WORK_BOTTOM)
        };
      }
    });
  }

  function takeForeground(hwnd: bigint) {
    const foreground = addressOf(user32.foregroundWindow.invoke([]).returnValue);
    const threadOfForeground = user32.windowThread.invoke([DynWin32Unsafe.pointer(foreground), pointerOf(null)]);
    const foregroundThread = numberOf(threadOfForeground.returnValue);
    const ownThread = numberOf(currentThread.invoke([]).returnValue);
    user32.attachInput.invoke([DynWin32.u32(ownThread), DynWin32.u32(foregroundThread), DynWin32.i32(1)]);
    user32.setForeground.invoke([DynWin32Unsafe.pointer(hwnd)]);
    user32.attachInput.invoke([DynWin32.u32(ownThread), DynWin32.u32(foregroundThread), DynWin32.i32(0)]);
  }

  function readLightTheme() {
    return withMemory({
      size: 2 * DWORD_BYTES,
      alignment: DWORD_BYTES,
      use(buffer) {
        buffer.writeU32(DWORD_BYTES, DWORD_BYTES);
        const subKey = wideMemory(PERSONALIZE_KEY);
        const valueName = wideMemory(LIGHT_THEME_VALUE);
        try {
          const result = registryValue.invoke([
            DynWin32Unsafe.pointer(HKEY_CURRENT_USER), pointerOf(subKey), pointerOf(valueName),
            DynWin32.u32(REG_DWORD_ONLY), pointerOf(null), pointerOf(buffer),
            DynWin32Unsafe.pointer(buffer.pointer(DWORD_BYTES).address)
          ]);
          return numberOf(result.returnValue) === 0 && buffer.readU32(0) !== 0;
        } finally {
          subKey.release();
          valueName.release();
        }
      }
    });
  }

  const native: TrayNative = {
    createOwnerWindow() {
      const classText = wideMemory("STATIC");
      try {
        const created = user32.createWindow.invoke([
          DynWin32.u32(0), pointerOf(classText), pointerOf(classText), DynWin32.u32(WS_POPUP),
          DynWin32.i32(0), DynWin32.i32(0), DynWin32.i32(0), DynWin32.i32(0),
          pointerOf(null), pointerOf(null), pointerOf(null), pointerOf(null)
        ]);
        return addressOf(created.returnValue);
      } finally {
        classText.release();
      }
    },
    destroyWindow(hwnd) {
      user32.destroyWindow.invoke([DynWin32Unsafe.pointer(hwnd)]);
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
            data
          });
          const result = shell32.notify.invoke([DynWin32.u32(operation), pointerOf(memory)]);
          return numberOf(result.returnValue) !== 0;
        }
      });
    },
    iconRect: readIconRect,
    readPointer() {
      user32.cursorPosition.invoke([pointerOf(pointBuffer)]);
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
    },
    isTaskbarLight: readLightTheme,
    workAreaAt: readWorkArea,
    focusWindow: takeForeground
  };
  return native;
}
