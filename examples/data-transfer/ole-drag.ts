import { DynComUnsafe, DynWinRtValue, WinGuid } from "@microsoft/dynwinrt/com/unsafe";
import type { DynComRawMemory } from "@microsoft/dynwinrt/com/unsafe/raw";
import {
  DRAG_ENTER_SLOT,
  DRAG_LEAVE_SLOT,
  DRAG_OVER_SLOT,
  DROP_SLOT,
  dropTargetInterface
} from "#src/data-transfer/ole-drop-target.js";
import { bindDll, POINTER_BYTES, withMemory } from "#src/win32-calls.js";
import nodePath from "node:path";

// A drag from another app, delivered to a window without a mouse: the window's
// registered OLE drop target (the `OleDropTargetInterface` property, which is
// where Windows looks it up during a real drag) is called with a data object
// the shell makes for real files, as Explorer's drag would call it.

const DROP_TARGET_PROPERTY = "OleDropTargetInterface";
const DROP_TARGET_IID = "00000122-0000-0000-c000-000000000046";
const DATA_OBJECT_IID_BYTES = Buffer.from("0e010000" + "0000" + "0000" + "c000000000000046", "hex");
const DATA_OBJECT_IID = "0000010e-0000-0000-c000-000000000046";
const GUID_BYTES = 16;
const POINT_BYTES = 8;
const DWORD_BYTES = 4;
const COORDINATE_BITS_COUNT = 32;
const COORDINATE_BITS = BigInt(COORDINATE_BITS_COUNT);
const NO_ADDRESS = BigInt(0);
const ALL_EFFECTS = 7;
const NO_KEYS = 0;

const { getProperty, clientToScreen } = bindDll({
  dll: "user32.dll",
  functions: {
    getProperty: ["GetPropW", ["pointer", "pointer"], "pointer"],
    clientToScreen: ["ClientToScreen", ["pointer", "pointer"], "i32"]
  }
});
const { createPidl, lastId, createDataObject } = bindDll({
  dll: "shell32.dll",
  functions: {
    createPidl: ["ILCreateFromPathW", ["pointer"], "pointer"],
    lastId: ["ILFindLastID", ["pointer"], "pointer"],
    createDataObject: ["SHCreateDataObject", ["pointer", "u32", "pointer", "pointer", "pointer", "pointer"], "i32"]
  }
});

function dataObjectOf(path: string) {
  const parent = createPidl(nodePath.dirname(path));
  const child = lastId(createPidl(path));
  return withMemory({
    size: POINTER_BYTES,
    alignment: POINTER_BYTES,
    use: pidls => withMemory({
      size: POINTER_BYTES,
      alignment: POINTER_BYTES,
      use: out => withMemory({
        size: GUID_BYTES,
        alignment: DWORD_BYTES,
        use(iid) {
          const address = Buffer.alloc(POINTER_BYTES);
          address.writeBigUInt64LE(child);
          pidls.writeBytes(0, address);
          iid.writeBytes(0, DATA_OBJECT_IID_BYTES);
          const result = createDataObject(parent, 1, pidls, null, iid, out);
          const isMade = result === 0;
          if (!isMade) {
            throw new Error(`SHCreateDataObject failed: ${result}`);
          }

          const made = out.readBytes(0, POINTER_BYTES).readBigUInt64LE(0);
          return DynComUnsafe.adoptOwnedComPointer(made, WinGuid.parse(DATA_OBJECT_IID));
        }
      })
    })
  });
}

function screenPointOf({ hwnd, client }: {
  hwnd: bigint;
  client: {
    x: number;
    y: number;
  };
}) {
  return withMemory({
    size: POINT_BYTES,
    alignment: DWORD_BYTES,
    use(memory: DynComRawMemory) {
      const bytes = Buffer.alloc(POINT_BYTES);
      bytes.writeInt32LE(Math.round(client.x), 0);
      bytes.writeInt32LE(Math.round(client.y), DWORD_BYTES);
      memory.writeBytes(0, bytes);
      clientToScreen(hwnd, memory);
      const screen = memory.readBytes(0, POINT_BYTES);
      const x = BigInt.asUintN(COORDINATE_BITS_COUNT, BigInt(screen.readInt32LE(0)));
      const y = BigInt.asUintN(COORDINATE_BITS_COUNT, BigInt(screen.readInt32LE(DWORD_BYTES)));
      return x | y << COORDINATE_BITS;
    }
  });
}

/** What a delivered drag answered at each call, as `DROPEFFECT` flags (copy 1, move 2, link 4, none 0). */
interface OleDragResult {
  readonly isRegistered: boolean;
  readonly enter: number;
  readonly over: number;
  readonly drop: number;
}

/**
 * Drags a file or folder over a window's registered OLE drop target and drops it.
 *
 * @param options - The window, the item, the points (client pixels) and whether to drop or leave.
 * @returns What each call answered; `isRegistered` is false when the window has no target.
 */
export function dragPathOver({ hwnd, path, enterAt, overAt, shouldDrop }: {
  hwnd: bigint;
  path: string;
  enterAt: {
    x: number;
    y: number;
  };
  overAt: {
    x: number;
    y: number;
  };
  shouldDrop: boolean;
}) {
  const address = getProperty(hwnd, DROP_TARGET_PROPERTY);
  const isRegistered = address !== NO_ADDRESS;
  if (!isRegistered) {
    return {
      isRegistered,
      enter: 0,
      over: 0,
      drop: 0
    } satisfies OleDragResult;
  }

  const target = DynComUnsafe.borrowComPointer(address, WinGuid.parse(DROP_TARGET_IID));
  const data = dataObjectOf(path);
  const interfaceOf = dropTargetInterface();
  function call({ slot, values }: {
    slot: number;
    values: DynWinRtValue[];
  }) {
    return interfaceOf.method(slot).invokeAll(target, values)[0]?.toNumber() ?? 0;
  }

  const enter = call({
    slot: DRAG_ENTER_SLOT,
    values: [data, DynWinRtValue.u32(NO_KEYS), DynWinRtValue.u64(
      screenPointOf({
        hwnd,
        client: enterAt
      })
    ), DynWinRtValue.u32(ALL_EFFECTS)]
  });
  const over = call({
    slot: DRAG_OVER_SLOT,
    values: [DynWinRtValue.u32(NO_KEYS), DynWinRtValue.u64(
      screenPointOf({
        hwnd,
        client: overAt
      })
    ), DynWinRtValue.u32(ALL_EFFECTS)]
  });
  const drop = shouldDrop ? call({
    slot: DROP_SLOT,
    values: [data, DynWinRtValue.u32(NO_KEYS), DynWinRtValue.u64(
      screenPointOf({
        hwnd,
        client: overAt
      })
    ), DynWinRtValue.u32(ALL_EFFECTS)]
  }) : interfaceOf.method(DRAG_LEAVE_SLOT).invokeAll(target, []).length;
  return {
    isRegistered,
    enter,
    over,
    drop: shouldDrop ? drop : 0
  } satisfies OleDragResult;
}
