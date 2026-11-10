import { DynWinRtValue, WinGuid } from "@microsoft/dynwinrt";
import { DynCom, DynComMethodSig, DynComUnsafe } from "@microsoft/dynwinrt/com/unsafe";
import { DynComRawMemory, DynComRawOwnedComPointer } from "@microsoft/dynwinrt/com/unsafe/raw";
import { call } from "#src/renderer/host/reflect.js";
import { bindDll, NO_ADDRESS, POINTER_BYTES } from "#src/win32-calls.js";
import { GraphicsCaptureItem, IID_GraphicsCaptureItem } from "#winui/windows/graphics/capture/GraphicsCaptureItem";

// A capture item for a monitor, by IGraphicsCaptureItemInterop.CreateForMonitor.
// GraphicsCaptureItem.TryCreateFromDisplayId is refused (access denied) in a
// packaged app, even with the consent granted; the interop call is not, and
// needs only the borderless-capture capability. The interface is not in the
// Windows metadata and derives from IUnknown only, so its method is declared
// here by hand at the slot after IUnknown's three.

const ITEM_CLASS = "Windows.Graphics.Capture.GraphicsCaptureItem";
const INTEROP = WinGuid.parse("3628e81b-3cac-4c60-b7f4-23ce0e0c3356");
const CREATE_FOR_MONITOR_SLOT = 4;
const MONITOR_DEFAULT_TO_NEAREST = 2;
const LOW_WORD_MASK = 0xffffffffn;
const WORD_BITS = 32n;
const POINT_BITS = 64;
const FROM_NATIVE = "_fromNative";

/** A point in physical pixels of the virtual screen. */
export interface ScreenPoint {
  readonly x: number;
  readonly y: number;
}

function bindUser32() {
  return bindDll({
    dll: "user32.dll",
    functions: {
      monitorFromPoint: ["MonitorFromPoint", ["i64", "u32"], "pointer"]
    }
  });
}

/**
 * The monitor a point is on, or the nearest one.
 *
 * @param point - A point in physical pixels of the virtual screen.
 * @returns The `HMONITOR`; undefined when the system has none.
 */
export function monitorHandleAt({ x, y }: ScreenPoint) {
  // A POINT is two 32-bit integers and travels in one 64-bit register: y above x.
  const packed = BigInt.asIntN(POINT_BITS, (BigInt(y) << WORD_BITS) | (BigInt(x) & LOW_WORD_MASK));
  const handle = bindUser32().monitorFromPoint(packed, MONITOR_DEFAULT_TO_NEAREST);
  const isFound = handle !== NO_ADDRESS;
  return isFound ? handle : undefined;
}

function createForMonitor({ interop, monitor, output }: {
  interop: DynComRawOwnedComPointer;
  monitor: bigint;
  output: DynComRawMemory;
}) {
  const registered = DynCom.registerIUnknownInterface("IGraphicsCaptureItemInterop", INTEROP).addMethodAt(
    CREATE_FOR_MONITOR_SLOT,
    "CreateForMonitor",
    new DynComMethodSig()
      .addIn(DynCom.u64Type())
      .addIn(DynCom.guidType())
      .addIn(DynCom.pointerType())
  );
  registered.method(CREATE_FOR_MONITOR_SLOT).invoke(DynComUnsafe.borrowComPointer(interop.address, INTEROP), [
    DynWinRtValue.u64(monitor),
    DynWinRtValue.guid(IID_GraphicsCaptureItem),
    DynComUnsafe.pointer(output.pointer().address)
  ]);
}

/**
 * The capture item of a monitor.
 *
 * @param monitor - The monitor's `HMONITOR`.
 * @returns The item, whose `size` is the monitor's size in physical pixels.
 * @throws {TypeError} when the binding gives back something that is not a capture item
 */
export function captureItemOfMonitor(monitor: bigint) {
  const interop = DynComRawOwnedComPointer.queryInterface(DynWinRtValue.activationFactory(ITEM_CLASS), INTEROP);
  const output = DynComRawMemory.allocate(POINTER_BYTES, POINTER_BYTES);
  try {
    createForMonitor({
      interop,
      monitor,
      output
    });
    const native = DynComUnsafe.adoptOwnedComPointer(output.readU64(0), IID_GraphicsCaptureItem);
    // The generated class makes its wrapper from a returned value in a static the types do not show.
    const item = call(GraphicsCaptureItem, FROM_NATIVE, native);
    const isItem = item instanceof GraphicsCaptureItem;
    if (!isItem) {
      throw new TypeError("the capture item binding returned something else");
    }

    return item;
  } finally {
    output.release();
    interop.release();
  }
}
