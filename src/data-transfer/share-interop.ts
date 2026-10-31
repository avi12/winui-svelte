import { DynWinRtValue, WinGuid } from "@microsoft/dynwinrt";
import { DynComMethodSig, DynComUnsafe } from "@microsoft/dynwinrt/com/unsafe";
import { DynComRawMemory, DynComRawOwnedComPointer } from "@microsoft/dynwinrt/com/unsafe/raw";
import { call } from "#src/renderer/host/reflect.js";
import {
  DataTransferManager,
  IID_DataTransferManager
} from "#winui/windows/application-model/data-transfer/DataTransferManager";

// IDataTransferManagerInterop (shobjidl_core.h): the call a desktop app makes
// to share from a window, because DataTransferManager.GetForCurrentView needs
// the UWP view an unpackaged process has not got. The interface is not in the
// Windows metadata, and it derives from IUnknown only (not IInspectable), so
// its two methods are declared here by hand at the slots after IUnknown's.

const CLASS_NAME = "Windows.ApplicationModel.DataTransfer.DataTransferManager";
const INTEROP = WinGuid.parse("3a3dcd6c-3eab-43dc-bcde-45671ce800c8");
const GET_FOR_WINDOW_SLOT = 3;
const SHOW_SHARE_UI_SLOT = 4;
const POINTER_BYTES = 8;
const FROM_NATIVE = "_fromNative";

function interopOf() {
  const factory = DynWinRtValue.activationFactory(CLASS_NAME);
  return DynComRawOwnedComPointer.queryInterface(factory, INTEROP).intoManaged(INTEROP);
}

function interopMethods() {
  return DynComUnsafe.registerIUnknownInterface("IDataTransferManagerInterop", INTEROP)
    .addMethodAt(
      GET_FOR_WINDOW_SLOT,
      "GetForWindow",
      new DynComMethodSig()
        .addIn(DynComUnsafe.unclassifiedPointerType())
        .addIn(DynComUnsafe.unclassifiedPointerType())
        .addIn(DynComUnsafe.unclassifiedPointerType())
    )
    .addMethodAt(SHOW_SHARE_UI_SLOT, "ShowShareUIForWindow", new DynComMethodSig().addIn(DynComUnsafe.unclassifiedPointerType()));
}

/**
 * The share manager of a window (`GetForWindow`), which is what raises
 * `DataRequested` when that window's share pane opens.
 *
 * @param hwnd - The window's handle.
 * @returns The manager.
 */
export function dataTransferManagerOf(hwnd: bigint) {
  const interop = interopOf();
  const result = DynComRawMemory.allocate(POINTER_BYTES, POINTER_BYTES);
  try {
    interopMethods().method(GET_FOR_WINDOW_SLOT).invoke(interop, [
      DynComUnsafe.pointer(hwnd),
      DynComUnsafe.iidPointer(IID_DataTransferManager),
      DynComUnsafe.pointer(result.pointer().address)
    ]);
    const manager = DynComUnsafe.adoptOwnedComPointer(result.readU64(0), IID_DataTransferManager);
    // The generated class makes its wrapper from a returned value in a static the types do not show.
    const wrapped = call(DataTransferManager, FROM_NATIVE, manager);
    const isManager = wrapped instanceof DataTransferManager;
    if (!isManager) {
      throw new TypeError("GetForWindow returned no DataTransferManager");
    }

    return wrapped;
  } finally {
    result.release();
    interop.release();
  }
}

/**
 * Opens the share pane of a window (`ShowShareUIForWindow`).
 *
 * @param hwnd - The window's handle.
 */
export function showShareUiForWindow(hwnd: bigint) {
  const interop = interopOf();
  try {
    interopMethods().method(SHOW_SHARE_UI_SLOT).invoke(interop, [DynComUnsafe.pointer(hwnd)]);
  } finally {
    interop.release();
  }
}
