import { DynWin32, DynWin32Unsafe } from "@microsoft/dynwinrt/win32/unsafe";
import {
  addressOf,
  bind,
  numberOf,
  pointerOf,
  wideMemory
} from "#src/win32-calls.js";

const MF_STRING = 0x0;
const MF_GRAYED = 0x1;
const MF_SEPARATOR = 0x800;
const TPM_RIGHTBUTTON = 0x2;
const TPM_BOTTOMALIGN = 0x20;
const TPM_NONOTIFY = 0x80;
const TPM_RETURNCMD = 0x100;
const WM_NULL = 0;

/** The kinds of line a native menu holds. */
export const NativeMenuEntryKind = {
  COMMAND: "command",
  SEPARATOR: "separator"
} as const;

/** One of `NativeMenuEntryKind`'s values. */
export type NativeMenuEntryKind = typeof NativeMenuEntryKind[keyof typeof NativeMenuEntryKind];

/** A line of a native menu: a command with a number to answer with, or a separator. */
export type NativeMenuEntry = {
  readonly kind: typeof NativeMenuEntryKind.COMMAND;
  readonly id: number;
  readonly label: string;
  readonly isEnabled: boolean;
} | {
  readonly kind: typeof NativeMenuEntryKind.SEPARATOR;
};

/**
 * The popup menu of Windows (`TrackPopupMenuEx`), behind one interface so the
 * tray's logic is pure and a test drives it with a fake. It needs no WinUI
 * and no window of the app, only a hidden window to own it.
 */
export interface NativeMenu {
  /**
   * Shows the menu at `point` and waits until it closes (it runs its own
   * message loop; the calling thread is busy meanwhile).
   *
   * @returns The `id` of the command the user chose, or 0 when none.
   */
  choose(options: {
    owner: bigint;
    point: {
      x: number;
      y: number;
    };
    entries: readonly NativeMenuEntry[];
  }): number;
}

/** The real popup menu. Its Win32 functions are bound when this is called, never when the module loads. */
export function createNativeMenu() {
  const createPopup = bind({
    dll: "user32.dll",
    entryPoint: "CreatePopupMenu",
    parameters: [],
    returnType: "pointer"
  });
  const destroyMenu = bind({
    dll: "user32.dll",
    entryPoint: "DestroyMenu",
    parameters: ["pointer"],
    returnType: "i32"
  });
  const appendMenu = bind({
    dll: "user32.dll",
    entryPoint: "AppendMenuW",
    parameters: ["pointer", "u32", "pointer", "pointer"],
    returnType: "i32"
  });
  const trackPopup = bind({
    dll: "user32.dll",
    entryPoint: "TrackPopupMenuEx",
    parameters: ["pointer", "u32", "i32", "i32", "pointer", "pointer"],
    returnType: "i32"
  });
  const postMessage = bind({
    dll: "user32.dll",
    entryPoint: "PostMessageW",
    parameters: ["pointer", "u32", "pointer", "pointer"],
    returnType: "i32"
  });

  function append({ menu, entry }: {
    menu: bigint;
    entry: NativeMenuEntry;
  }) {
    const isSeparator = entry.kind === NativeMenuEntryKind.SEPARATOR;
    if (isSeparator) {
      appendMenu.invoke([DynWin32Unsafe.pointer(menu), DynWin32.u32(MF_SEPARATOR), pointerOf(null), pointerOf(null)]);
      return;
    }

    const text = wideMemory(entry.label);
    try {
      const flags = MF_STRING | (entry.isEnabled ? 0 : MF_GRAYED);
      appendMenu.invoke([
        DynWin32Unsafe.pointer(menu),
        DynWin32.u32(flags),
        DynWin32Unsafe.pointer(BigInt(entry.id)),
        pointerOf(text)
      ]);
    } finally {
      text.release();
    }
  }

  const native: NativeMenu = {
    choose({ owner, point, entries }) {
      const menu = addressOf(createPopup.invoke([]).returnValue);
      try {
        for (const entry of entries) {
          append({
            menu,
            entry
          });
        }

        const chosen = trackPopup.invoke([
          DynWin32Unsafe.pointer(menu),
          DynWin32.u32(TPM_RETURNCMD | TPM_NONOTIFY | TPM_RIGHTBUTTON | TPM_BOTTOMALIGN),
          DynWin32.i32(point.x),
          DynWin32.i32(point.y),
          DynWin32Unsafe.pointer(owner),
          pointerOf(null)
        ]);
        postMessage.invoke([DynWin32Unsafe.pointer(owner), DynWin32.u32(WM_NULL), pointerOf(null), pointerOf(null)]);
        return numberOf(chosen.returnValue);
      } finally {
        destroyMenu.invoke([DynWin32Unsafe.pointer(menu)]);
      }
    }
  };
  return native;
}
