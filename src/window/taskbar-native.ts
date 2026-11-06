import type { TaskbarBackend } from "./taskbar.ts";
import { DynWinRtValue, WinGuid } from "@microsoft/dynwinrt";
import { DynCom, DynComMethodSig, DynComUnsafe } from "@microsoft/dynwinrt/com/unsafe";
import { DynComRawMemory } from "@microsoft/dynwinrt/com/unsafe/raw";
import { bind, pointerOf } from "#src/win32-calls.js";
import { createIconCalls } from "#src/win32-icons.js";

// ITaskbarList3 (shobjidl_core.h) has no WinRT form, so its methods are
// declared here by hand at their vtable slots: ITaskbarList's HrInit is 3,
// ITaskbarList2 adds one (8), and ITaskbarList3 starts at 9. The object is made
// with CoCreateInstance on the UI thread, which WinUI has already put in an
// apartment.

const CLSID_TASKBAR_LIST = "56FDF344-FD6D-11d0-958A-006097C9A090";
const IID_TASKBAR_LIST_3 = WinGuid.parse("ea1afb91-9e28-4b86-90e9-9e9f8a5eefaf");
const HR_INIT_SLOT = 3;
const SET_PROGRESS_VALUE_SLOT = 9;
const SET_PROGRESS_STATE_SLOT = 10;
const SET_OVERLAY_ICON_SLOT = 18;
const FLASH_INFO_SIZE = 32;
const POINTER_BYTES = 8;
const NO_ICON = 0n;
const OFFSET_SIZE = 0;
const OFFSET_HWND = 8;
const OFFSET_FLAGS = 16;
const OFFSET_COUNT = 20;

function taskbarMethods() {
  function pointer() {
    return DynComUnsafe.unclassifiedPointerType();
  }

  return DynComUnsafe.registerIUnknownInterface("ITaskbarList3", IID_TASKBAR_LIST_3)
    .addMethodAt(HR_INIT_SLOT, "HrInit", new DynComMethodSig())
    .addMethodAt(
      SET_PROGRESS_VALUE_SLOT,
      "SetProgressValue",
      new DynComMethodSig().addIn(pointer()).addIn(DynCom.u64Type()).addIn(DynCom.u64Type())
    )
    .addMethodAt(
      SET_PROGRESS_STATE_SLOT,
      "SetProgressState",
      new DynComMethodSig().addIn(pointer()).addIn(DynCom.u32Type())
    )
    .addMethodAt(
      SET_OVERLAY_ICON_SLOT,
      "SetOverlayIcon",
      new DynComMethodSig().addIn(pointer()).addNullableIn(pointer()).addNullableIn(pointer())
    );
}

/**
 * The real taskbar calls. The COM object is made on first use and the Win32
 * functions are bound when this is called, never when the module loads.
 *
 * @returns A backend for `TaskbarButton`.
 */
export function createTaskbarNative() {
  const icons = createIconCalls();
  const flashWindow = bind({
    dll: "user32.dll",
    entryPoint: "FlashWindowEx",
    parameters: ["pointer"],
    returnType: "i32"
  });
  const methods = taskbarMethods();
  let list: DynWinRtValue | null = null;

  function taskbarList() {
    if (list) {
      return list;
    }

    const created = DynComUnsafe.coCreateInstance(CLSID_TASKBAR_LIST, IID_TASKBAR_LIST_3);
    methods.method(HR_INIT_SLOT).invoke(created, []);
    list = created;
    return created;
  }

  function iconOf(icon: Parameters<TaskbarBackend["setOverlay"]>[0]["icon"]) {
    const isNone = icon === null;
    if (isNone) {
      return NO_ICON;
    }

    return "path" in icon
      ? icons.loadIconFile({
        path: icon.path,
        size: icons.smallIconSize()
      })
      : icons.createIcon(icon);
  }

  const backend: TaskbarBackend = {
    smallIconSize: icons.smallIconSize,
    setProgress({ hwnd, state, completed, total }) {
      const target = DynComUnsafe.pointer(hwnd);
      methods.method(SET_PROGRESS_VALUE_SLOT).invoke(taskbarList(), [
        target, DynWinRtValue.u64(completed), DynWinRtValue.u64(total)
      ]);
      methods.method(SET_PROGRESS_STATE_SLOT).invoke(taskbarList(), [target, DynWinRtValue.u32(state)]);
    },
    setOverlay({ hwnd, icon, description }) {
      const handle = iconOf(icon);
      const hasIcon = handle !== NO_ICON;
      const isMissing = icon !== null && !hasIcon;
      if (isMissing) {
        throw new Error("the overlay icon could not be loaded");
      }

      try {
        methods.method(SET_OVERLAY_ICON_SLOT).invoke(taskbarList(), [
          DynComUnsafe.pointer(hwnd),
          DynComUnsafe.pointer(hasIcon ? handle : null),
          DynComUnsafe.wideStringPointer(hasIcon ? description : null)
        ]);
      } finally {
        if (hasIcon) {
          icons.destroyIcon(handle);
        }
      }
    },
    flash({ hwnd, flags, count }) {
      const info = DynComRawMemory.allocate(FLASH_INFO_SIZE, POINTER_BYTES);
      try {
        info.writeU32(OFFSET_SIZE, FLASH_INFO_SIZE);
        info.writeU64(OFFSET_HWND, hwnd);
        info.writeU32(OFFSET_FLAGS, flags);
        info.writeU32(OFFSET_COUNT, count);
        flashWindow.invoke([pointerOf(info)]);
      } finally {
        info.release();
      }
    }
  };
  return backend;
}
