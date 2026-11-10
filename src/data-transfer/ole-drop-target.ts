import { createDragHelper } from "./drag-helper.ts";
import type { DragHelper } from "./drag-helper.ts";
import {
  DATA_OBJECT_IID,
  enterOle,
  findChildWindow,
  registerDropTarget,
  revokeDropTarget
} from "./native.ts";
import { DynCom, DynComMethodSig, DynWinRtValue, WinGuid } from "@microsoft/dynwinrt/com/unsafe";
import type { DynWinRTValue } from "@microsoft/dynwinrt/com/unsafe";

// WinUI 3 registers no OLE drop target on its window (no `OleDropTargetInterface`
// property on any window of its tree), so Windows answers a drag from another
// app with the forbidden sign. This registers one on the child window that holds
// the content (the top-level when there is none), with `RegisterDragDrop`, as
// every classic window that takes drops does, and hands its four calls to a handler.
// Windows asks only the window under the cursor, and WinUI's content is a child
// window of its own. The same target on both windows is a dead end: a drag that
// enters over the top-level's resize border and moves onto the content gets a
// `DragLeave` and never a new `DragEnter`, so the content never hears of it.
// A drag over the border or title bar shows the forbidden sign; no zone lives there.

const CONTENT_WINDOW_CLASS = "Microsoft.UI.Content.DesktopChildSiteBridge";
const NO_WINDOW = BigInt(0);
const DROP_TARGET_IID = "00000122-0000-0000-c000-000000000046";
/** The vtable slots of `IDropTarget` after the three of `IUnknown`. */
export const DRAG_ENTER_SLOT = 3;
export const DRAG_OVER_SLOT = 4;
export const DRAG_LEAVE_SLOT = 5;
export const DROP_SLOT = 6;
const POINT_COORDINATE_BITS = 32n;
const POINT_COORDINATE_MASK = 0xffff_ffffn;
const SUCCESS = 0;
const NO_EFFECT = 0;
const ORIGIN = {
  x: 0,
  y: 0
};

/** A drag effect: the `DROPEFFECT` flags (none 0, copy 1, move 2, link 4), the same bits as `DataPackageOperation`. */
export type OleEffect = number;

/** What one call of a drag tells the target. */
export interface OleDragCall {
  /** The `IDataObject` the source offers; null on `DragOver`, which repeats the one of `DragEnter`. */
  readonly data: DynWinRTValue | null;
  /** The `MK_*` key and button flags. */
  readonly keys: number;
  /** The cursor, in screen pixels. */
  readonly point: {
    readonly x: number;
    readonly y: number;
  };
  /** What the source allows. */
  readonly allowedEffects: OleEffect;
}

/** An `OleDragCall` that carries the data object (`DragEnter` and `Drop`). */
export interface OleDataCall extends OleDragCall {
  readonly data: DynWinRTValue;
}

/** What answers a drag over the window: each returns the effect the cursor shows and a drop does. */
export interface OleDropHandler {
  enter(call: OleDataCall): OleEffect;
  over(call: OleDragCall): OleEffect;
  leave(): void;
  drop(call: OleDataCall): OleEffect;
}

function pointOf(packed: DynWinRTValue) {
  const bits = packed.toU64Bigint();
  return {
    x: Number(BigInt.asIntN(Number(POINT_COORDINATE_BITS), bits & POINT_COORDINATE_MASK)),
    y: Number(BigInt.asIntN(Number(POINT_COORDINATE_BITS), bits >> POINT_COORDINATE_BITS))
  };
}

let cachedInterface: ReturnType<typeof makeInterface> | undefined;

function makeInterface() {
  const u32 = DynCom.u32Type();
  const u64 = DynCom.u64Type();
  const data = DynCom.interfaceType(WinGuid.parse(DATA_OBJECT_IID));
  return DynCom.registerIUnknownInterface("IDropTarget", WinGuid.parse(DROP_TARGET_IID))
    .addMethod("DragEnter", new DynComMethodSig().addNullableIn(data).addIn(u32).addIn(u64).addInOut(u32))
    .addMethod("DragOver", new DynComMethodSig().addIn(u32).addIn(u64).addInOut(u32))
    .addMethod("DragLeave", new DynComMethodSig())
    .addMethod("Drop", new DynComMethodSig().addNullableIn(data).addIn(u32).addIn(u64).addInOut(u32));
}

/**
 * The `IDropTarget` interface as registered with dynwinrt, whose `method(slot)`
 * calls a registered target: slots 3 to 6 are `DragEnter`, `DragOver`,
 * `DragLeave` and `Drop`. For tests that deliver a drag without a mouse.
 *
 * @returns The interface.
 */
export function dropTargetInterface() {
  cachedInterface ??= makeInterface();
  return cachedInterface;
}

function callOf({ slot, args }: {
  slot: number;
  args: ReadonlyArray<DynWinRTValue | null | undefined>;
}) {
  const hasData = slot === DRAG_ENTER_SLOT || slot === DROP_SLOT;
  const [data, keys, packedPoint, allowed] = hasData ? args : [null, ...args];
  return {
    data: data ?? null,
    keys: keys?.toNumber() ?? 0,
    point: packedPoint ? pointOf(packedPoint) : ORIGIN,
    allowedEffects: allowed?.toNumber() ?? 0
  };
}

function answer({ handler, slot, call }: {
  handler: OleDropHandler;
  slot: number;
  call: OleDragCall;
}) {
  const { data } = call;
  const isOver = slot === DRAG_OVER_SLOT;
  if (isOver) {
    return handler.over(call);
  }

  const hasNoData = data === null;
  if (hasNoData) {
    return NO_EFFECT;
  }

  const withData = {
    ...call,
    data
  };
  return slot === DRAG_ENTER_SLOT ? handler.enter(withData) : handler.drop(withData);
}

// The shell's drag helper hears each call with the effect answered, and draws the drag's picture for it.
function tellHelper({ helper, slot, call, effect }: {
  helper: DragHelper;
  slot: number;
  call: OleDragCall;
  effect: OleEffect;
}) {
  const { data, point } = call;
  const hasData = data !== null;
  const isOver = slot === DRAG_OVER_SLOT;
  const isEntering = hasData && slot === DRAG_ENTER_SLOT;
  if (isOver) {
    helper.over({
      point,
      effect
    });
  } else if (isEntering) {
    helper.enter({
      data,
      point,
      effect
    });
  } else if (hasData) {
    helper.drop({
      data,
      point,
      effect
    });
  }
}

/**
 * Makes a window take drags from other apps: registers an OLE drop target on
 * it that calls `handler`. Call it on the UI thread (it enters OLE there).
 *
 * @param options - The top-level window and what answers its drags.
 * @returns What revokes the registration; null when Windows refused it (another target is registered).
 */
export function registerOleDropTarget({ hwnd, handler }: {
  readonly hwnd: bigint;
  readonly handler: OleDropHandler;
}) {
  enterOle();
  const content = findChildWindow({
    hwnd,
    className: CONTENT_WINDOW_CLASS
  });
  const hasContentWindow = content !== NO_WINDOW;
  const targetWindow = hasContentWindow ? content : hwnd;
  const helper = createDragHelper(targetWindow);
  const target = DynCom.createComObject([dropTargetInterface()], (_iid, slot, ...args) => {
    const isLeaving = slot === DRAG_LEAVE_SLOT;
    if (isLeaving) {
      helper?.leave();
      handler.leave();
      return SUCCESS;
    }

    const call = callOf({
      slot,
      args
    });
    const effect = answer({
      handler,
      slot,
      call
    });
    if (helper) {
      tellHelper({
        helper,
        slot,
        call,
        effect
      });
    }

    return [SUCCESS, DynWinRtValue.u32(effect)];
  });
  DynCom.bindComObject(target);
  const view = target.cast(WinGuid.parse(DROP_TARGET_IID));
  const hresult = registerDropTarget({
    hwnd: targetWindow,
    target: view,
    iid: DROP_TARGET_IID
  });
  const isRegistered = hresult === SUCCESS;
  if (!isRegistered) {
    view.release();
    helper?.release();
    return null;
  }

  return () => {
    revokeDropTarget(targetWindow);
    view.release();
    target.release();
    helper?.release();
  };
}
