import type { DragFeedback, Position } from "./drag-event.ts";
import type { DropArgs } from "./drop-target.ts";
import { clientPointOf } from "./native.ts";
import { copyOf, readerOf, sourceOfReader } from "./ole-data-object.ts";
import type { OleDataCall, OleDragCall, OleDropHandler, OleEffect } from "./ole-drop-target.ts";
import { registerOleDropTarget } from "./ole-drop-target.ts";
import { identityOf } from "#src/native-identity.js";
import { projectAs } from "#winui/lifetime";
import type { WindowId } from "#winui/microsoft/ui/windowing/AppWindow";
import { AppWindow } from "#winui/microsoft/ui/windowing/AppWindow";
import { VisualTreeHelper } from "#winui/microsoft/ui/xaml/media/VisualTreeHelper";
import { UIElement } from "#winui/microsoft/ui/xaml/UIElement";
import { DragDropModifiers } from "#winui/windows/application-model/data-transfer/drag-drop/DragDropModifiers";

// A drag from another app reaches the window as OLE calls (ole-drop-target.ts);
// WinUI's own drop events never fire for it. This routes each call the way
// WinUI routes a drag it does receive: the element under the cursor, then the
// nearest ancestor that is a drop zone answers, and a point outside every zone
// answers "no drop" (the forbidden sign).

const MK_SHIFT = 0x4;
const MK_CONTROL = 0x8;
const MK_ALT = 0x20;
const MK_LBUTTON = 0x1;
const MK_RBUTTON = 0x2;
const MK_MBUTTON = 0x10;
const NO_EFFECT = 0;
const FALLBACK_SCALE = 1;
const HIT_SIZE = 1;

/** What a drop zone answers the window's drags with: the calls of its binding. */
export interface WindowZone {
  enter(args: DropArgs): void;
  over(args: DropArgs): void;
  leave(args: DropArgs): void;
  drop(args: DropArgs): Promise<void>;
}

/** The part of a control's XamlRoot the window needs. */
export interface WindowRoot {
  readonly content: object | null;
  readonly rasterizationScale?: number;
  readonly contentIslandEnvironment?: {
    readonly appWindowId: WindowId;
  };
}

/** The part of a control that tells which window it is in. */
export interface WindowControl {
  readonly xamlRoot?: WindowRoot | null;
  onLoaded?(callback: () => void): () => void;
}

interface Entry {
  readonly control: WindowControl;
  readonly zone: WindowZone;
}

interface OpenDrag {
  reader: ReturnType<typeof readerOf>;
  allowedEffects: OleEffect;
  entry: Entry | null;
  effect: OleEffect;
}

class WindowDrop implements OleDropHandler {
  readonly entries = new Map<unknown, Entry>();
  private revoke: (() => void) | null = null;
  private drag: OpenDrag | null = null;
  private stopDestroying: (() => void) | null = null;
  private readonly hwnd: bigint;
  private readonly root: WindowRoot;
  private readonly windowId: WindowId;

  constructor({ windowId, root }: {
    windowId: WindowId;
    root: WindowRoot;
  }) {
    this.windowId = windowId;
    this.hwnd = windowId.value;
    this.root = root;
  }

  // Revoked with the window: a target still registered when it goes down is a leak.
  start() {
    this.revoke = registerOleDropTarget({
      hwnd: this.hwnd,
      handler: this
    });
    this.stopDestroying = AppWindow.getFromWindowId(this.windowId).onDestroying(() => this.stop());
  }

  stop() {
    this.revoke?.();
    this.revoke = null;
    this.stopDestroying?.();
    this.stopDestroying = null;
  }

  enter(call: OleDataCall) {
    this.drag = {
      reader: readerOf(call.data),
      allowedEffects: call.allowedEffects,
      entry: null,
      effect: NO_EFFECT
    };
    return this.route({
      call,
      isEntering: true
    });
  }

  over(call: OleDragCall) {
    return this.route({
      call,
      isEntering: false
    });
  }

  leave() {
    const { drag } = this;
    this.drag = null;

    if (drag?.entry) {
      drag.entry.zone.leave(
        this.argsOf({
          drag,
          call: null
        })
      );
    }
  }

  drop(call: OleDataCall) {
    const { drag } = this;
    this.drag = null;
    const hasZone = drag?.entry != null;
    if (!hasZone) {
      return NO_EFFECT;
    }

    const frozen = {
      ...drag,
      reader: copyOf(readerOf(call.data))
    };
    const args = this.argsOf({
      drag: frozen,
      call
    });
    drag.entry?.zone.drop(args).catch(reportError);
    return drag.effect;
  }

  private route({ call, isEntering }: {
    call: OleDragCall;
    isEntering: boolean;
  }) {
    const { drag } = this;
    if (!drag) {
      return NO_EFFECT;
    }

    const found = this.zoneAt(call.point);
    const hasChanged = found !== drag.entry;
    const isLeavingZone = hasChanged && drag.entry !== null;
    if (isLeavingZone) {
      drag.entry?.zone.leave(
        this.argsOf({
          drag,
          call
        })
      );
    }

    drag.entry = found;

    if (!found) {
      drag.effect = NO_EFFECT;
      return NO_EFFECT;
    }

    const args = this.argsOf({
      drag,
      call
    });
    const isNew = isEntering || hasChanged;
    if (isNew) {
      found.zone.enter(args);
    } else {
      found.zone.over(args);
    }

    drag.effect = args.acceptedOperation;
    return drag.effect;
  }

  private zoneAt(point: Position) {
    const { content } = this.root;
    const hasNoContent = content === null;
    if (hasNoContent) {
      return null;
    }

    const local = clientDipOf({
      hwnd: this.hwnd,
      point,
      scale: this.root.rasterizationScale ?? FALLBACK_SCALE
    });
    const subtree = projectAs(content, UIElement);
    // The generated dispatch cannot tell the point overload from the rectangle one (both take two
    // arguments), so a one-pixel rectangle stands for the point.
    const hits = VisualTreeHelper.findElementsInHostCoordinates({
      ...local,
      width: HIT_SIZE,
      height: HIT_SIZE
    }, subtree);
    for (const element of hits ?? []) {
      const found = this.nearestEntry(element);
      if (found) {
        return found;
      }
    }

    return null;
  }

  // The element itself, then its ancestors, until one is a zone.
  private nearestEntry(element: object) {
    for (let node: object | null = element; node !== null; node = parentOf(node)) {
      const entry = this.entries.get(identityOf(node));
      if (entry) {
        return entry;
      }
    }

    return null;
  }

  private argsOf({ drag, call }: {
    drag: OpenDrag;
    call: OleDragCall | null;
  }) {
    const dragUIOverride: DragFeedback = {
      caption: "",
      isCaptionVisible: false,
      isGlyphVisible: true,
      isContentVisible: true
    };
    const { content } = this.root;
    const local = call === null ? {
      x: 0,
      y: 0
    } : clientDipOf({
      hwnd: this.hwnd,
      point: call.point,
      scale: this.root.rasterizationScale ?? FALLBACK_SCALE
    });
    const args: DropArgs = {
      acceptedOperation: NO_EFFECT,
      allowedOperations: drag.allowedEffects,
      source: sourceOfReader(drag.reader),
      modifiers: modifiersOf(call?.keys ?? 0),
      dragUIOverride,
      handled: false,
      getPosition: relativeTo => positionIn({
        content,
        relativeTo,
        local
      }),
      getDeferral: () => ({
        complete: () => undefined
      })
    };
    return args;
  }
}

function reportError(error: unknown) {
  queueMicrotask(() => {
    throw error;
  });
}

const MODIFIER_OF_KEY = [
  [MK_SHIFT, DragDropModifiers.Shift],
  [MK_CONTROL, DragDropModifiers.Control],
  [MK_ALT, DragDropModifiers.Alt],
  [MK_LBUTTON, DragDropModifiers.LeftButton],
  [MK_MBUTTON, DragDropModifiers.MiddleButton],
  [MK_RBUTTON, DragDropModifiers.RightButton]
] as const;

function modifiersOf(keys: number) {
  let modifiers = 0;
  for (const [key, modifier] of MODIFIER_OF_KEY) {
    const isHeld = (keys & key) !== 0;
    if (isHeld) {
      modifiers |= modifier;
    }
  }

  return modifiers;
}

function parentOf(node: object) {
  const parent: object | null | undefined = VisualTreeHelper.getParent(projectAs(node, UIElement));
  return parent ?? null;
}

// A screen point in the window content's device-independent pixels.
function clientDipOf({ hwnd, point, scale }: {
  hwnd: bigint;
  point: Position;
  scale: number;
}) {
  const client = clientPointOf({
    hwnd,
    point
  });
  return {
    x: client.x / scale,
    y: client.y / scale
  };
}

function positionIn({ content, relativeTo, local }: {
  content: object | null;
  relativeTo: object;
  local: Position;
}) {
  const hasNoContent = content === null;
  if (hasNoContent) {
    return local;
  }

  const toTarget = projectAs(content, UIElement).transformToVisual(projectAs(relativeTo, UIElement));
  const { x, y } = toTarget.transformPoint(local);
  return {
    x,
    y
  };
}

const windows = new Map<bigint, WindowDrop>();

function attach(entry: Entry) {
  const root = entry.control.xamlRoot;
  const environment = root?.contentIslandEnvironment;
  const isOutsideWindow = !root || !environment;
  if (isOutsideWindow) {
    return null;
  }

  const { appWindowId } = environment;
  const hwnd = appWindowId.value;
  const existing = windows.get(hwnd);
  const state = existing ?? new WindowDrop({
    windowId: appWindowId,
    root
  });
  if (!existing) {
    windows.set(hwnd, state);
    state.start();
  }

  const key = identityOf(entry.control);
  state.entries.set(key, entry);
  return () => {
    state.entries.delete(key);
    const isEmpty = state.entries.size === 0;
    if (isEmpty) {
      state.stop();
      windows.delete(hwnd);
    }
  };
}

/**
 * Makes a drop zone take the drags of other apps (Explorer, a browser) that
 * reach its window: the window gets an OLE drop target, routed to the nearest
 * zone under the cursor. A control not yet in a window joins when it loads.
 *
 * @param options - The control and what answers its drags.
 * @returns What removes the zone; the window stops taking drags with its last zone.
 */
export function joinWindow({ control, zone }: {
  control: WindowControl;
  zone: WindowZone;
}) {
  const entry = {
    control,
    zone
  };
  let leave = attach(entry);
  const isLoaded = leave !== null;
  const stopLoaded = isLoaded ? doNothing : listenForLoad();
  function doNothing() {
    return undefined;
  }

  function listenForLoad() {
    return control.onLoaded?.(() => {
      leave = attach(entry);
    }) ?? doNothing;
  }

  return () => {
    stopLoaded();
    leave?.();
  };
}
