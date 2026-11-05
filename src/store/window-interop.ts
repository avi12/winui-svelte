import { DynWinRtValue, WinGuid } from "@microsoft/dynwinrt";
import { DynComMethodSig, DynComUnsafe } from "@microsoft/dynwinrt/com/unsafe";
import { DynComRawOwnedComPointer } from "@microsoft/dynwinrt/com/unsafe/raw";
import { read } from "#src/renderer/host/reflect.js";

// IInitializeWithWindow (shobjidl_core.h): what a desktop app calls on a
// WinRT object that shows UI (StoreContext among them) so its dialogs belong
// to a window. It derives from IUnknown only, so its one method is declared
// here by hand at the slot after IUnknown's.

const INITIALIZE_WITH_WINDOW = WinGuid.parse("3e68d4bd-7135-4d10-8018-9fb6d9f33fa1");
const INITIALIZE_SLOT = 3;
const NATIVE_OBJECT = "_obj";

/**
 * Makes a WinRT object's UI belong to a window (`IInitializeWithWindow`).
 *
 * @param options - The object and the window's handle.
 */
export function initializeWithWindow({ target, hwnd }: {
  target: object;
  hwnd: bigint;
}) {
  const native = read(target, NATIVE_OBJECT);
  const isNative = native instanceof DynWinRtValue;
  if (!isNative) {
    throw new TypeError("the object is not a WinRT object");
  }

  const pointer = DynComRawOwnedComPointer.queryInterface(native, INITIALIZE_WITH_WINDOW);
  const managed = pointer.intoManaged(INITIALIZE_WITH_WINDOW);
  try {
    DynComUnsafe.registerIUnknownInterface("IInitializeWithWindow", INITIALIZE_WITH_WINDOW)
      .addMethodAt(INITIALIZE_SLOT, "Initialize", new DynComMethodSig().addIn(DynComUnsafe.unclassifiedPointerType()))
      .method(INITIALIZE_SLOT)
      .invoke(managed, [DynComUnsafe.pointer(hwnd)]);
  } finally {
    managed.release();
  }
}
