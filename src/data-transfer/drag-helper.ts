import { createInstanceOf, DATA_OBJECT_IID } from "./native.ts";
import {
  DynCom,
  DynComMethodSig,
  DynComUnsafe,
  DynWinRtValue,
  WinGuid
} from "@microsoft/dynwinrt/com/unsafe";
import type { DynWinRTValue } from "@microsoft/dynwinrt/com/unsafe";
import type { DynComRawMemory } from "@microsoft/dynwinrt/com/unsafe/raw";
import { DWORD_BYTES, NO_ADDRESS, withMemory } from "#src/win32-calls.js";

// The shell draws the picture a drag carries (the folder's thumbnail, the
// "Copy" or "Link" label) only over a window whose drop target tells the
// shell's drag helper about the drag; Explorer and every classic app do. This
// is that call, one helper per window.

const DRAG_DROP_HELPER_CLASS = "4657278a-411b-11d2-839a-00c04fd918d0";
const DROP_TARGET_HELPER_IID = "4657278b-411b-11d2-839a-00c04fd918d0";
const DRAG_ENTER_SLOT = 3;
const DRAG_LEAVE_SLOT = 4;
const DRAG_OVER_SLOT = 5;
const DROP_SLOT = 6;
const POINT_BYTES = 8;

let cachedInterface: ReturnType<typeof makeInterface> | undefined;

function makeInterface() {
  const u32 = DynCom.u32Type();
  const u64 = DynCom.u64Type();
  const data = DynCom.interfaceType(WinGuid.parse(DATA_OBJECT_IID));
  return DynCom.registerIUnknownInterface("IDropTargetHelper", WinGuid.parse(DROP_TARGET_HELPER_IID))
    .addMethod("DragEnter", new DynComMethodSig().addIn(u64).addNullableIn(data).addIn(u64).addIn(u32))
    .addMethod("DragLeave", new DynComMethodSig())
    .addMethod("DragOver", new DynComMethodSig().addIn(u64).addIn(u32))
    .addMethod("Drop", new DynComMethodSig().addNullableIn(data).addIn(u64).addIn(u32));
}

function interfaceOf() {
  cachedInterface ??= makeInterface();
  return cachedInterface;
}

interface Point {
  readonly x: number;
  readonly y: number;
}

// The helper reads the point while the call runs, so the memory only lives that long.
function withPoint({ point, use }: {
  point: Point;
  use: (address: bigint) => boolean;
}) {
  return withMemory({
    size: POINT_BYTES,
    alignment: DWORD_BYTES,
    use(memory: DynComRawMemory) {
      memory.writeI32(0, point.x);
      memory.writeI32(DWORD_BYTES, point.y);
      return use(memory.pointer().address);
    }
  });
}

/** What tells the shell about a drag over a window, so that it draws the drag's picture there. */
export interface DragHelper {
  enter(call: {
    readonly data: DynWinRTValue;
    readonly point: Point;
    readonly effect: number;
  }): void;
  over(call: {
    readonly point: Point;
    readonly effect: number;
  }): void;
  leave(): void;
  drop(call: {
    readonly data: DynWinRTValue;
    readonly point: Point;
    readonly effect: number;
  }): void;
  release(): void;
}

/**
 * Makes the shell's drag helper for a window.
 *
 * @param hwnd - The window the drop target is registered on.
 * @returns The helper; null when the shell could not make it (the drag then works without a picture).
 */
export function createDragHelper(hwnd: bigint) {
  const address = createInstanceOf({
    classId: DRAG_DROP_HELPER_CLASS,
    interfaceId: DROP_TARGET_HELPER_IID
  });
  const isMissing = address === NO_ADDRESS;
  if (isMissing) {
    return null;
  }

  const helper = DynComUnsafe.adoptOwnedComPointer(address, WinGuid.parse(DROP_TARGET_HELPER_IID));
  const calls = interfaceOf();

  // A drag whose source gave no picture makes the helper answer with an error (DV_E_FORMATETC):
  // the picture is only decoration, so the drag goes on without it.
  function call({ slot, values }: {
    slot: number;
    values: DynWinRTValue[];
  }) {
    try {
      calls.method(slot).invokeAll(helper, values);
      return true;
    } catch {
      return false;
    }
  }

  // The helper hears of a drag only after it accepted the entry: told of a drag it refused, it
  // keeps the window from receiving the next one when the cursor moves on to another window.
  let isAccepted = false;

  return {
    enter({ data, point, effect }) {
      isAccepted = withPoint({
        point,
        use: pointAddress => call({
          slot: DRAG_ENTER_SLOT,
          values: [
            DynWinRtValue.u64(hwnd),
            data,
            DynWinRtValue.u64(pointAddress),
            DynWinRtValue.u32(effect)
          ]
        })
      });
    },
    over({ point, effect }) {
      if (!isAccepted) {
        return;
      }

      withPoint({
        point,
        use: pointAddress => call({
          slot: DRAG_OVER_SLOT,
          values: [DynWinRtValue.u64(pointAddress), DynWinRtValue.u32(effect)]
        })
      });
    },
    leave() {
      if (!isAccepted) {
        return;
      }

      isAccepted = false;
      call({
        slot: DRAG_LEAVE_SLOT,
        values: []
      });
    },
    drop({ data, point, effect }) {
      if (!isAccepted) {
        return;
      }

      isAccepted = false;
      withPoint({
        point,
        use: pointAddress => call({
          slot: DROP_SLOT,
          values: [data, DynWinRtValue.u64(pointAddress), DynWinRtValue.u32(effect)]
        })
      });
    },
    release() {
      helper.release();
    }
  } satisfies DragHelper;
}
