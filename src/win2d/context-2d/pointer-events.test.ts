import { createCanvas2D } from "./canvas-element.ts";
import type { CanvasEvent } from "./canvas-element.ts";
import { pointerHandlers } from "./pointer-events.ts";
import { roInitialize } from "@microsoft/dynwinrt";
import { initWindowsAppSdk } from "#src/window/bootstrap.js";
import { InputPointerDeviceType } from "#winui/microsoft/ui/input/PointerDeviceType";
import { InputPointerUpdateKind } from "#winui/microsoft/ui/input/PointerUpdateKind";
import type { PointerRoutedEventArgs } from "#winui/microsoft/ui/xaml/input/PointerRoutedEventArgs";
import type { UIElement } from "#winui/microsoft/ui/xaml/UIElement";
import { VirtualKeyModifiers } from "#winui/windows/system/VirtualKeyModifiers";
import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import path from "node:path";
import { test } from "node:test";

// The WinUI pointer handlers of a Canvas2D control, raised with event data
// shaped like PointerRoutedEventArgs (a test must not inject real input).
// Skipped where the Win2D library was not restored (pnpm restore) or the
// bindings were not built (pnpm build).

const NATIVE_LIBRARY = path.join(import.meta.dirname, "..", "..", "..", ".winapp", "bin", process.arch, "Microsoft.Graphics.Canvas.dll");
const BINDINGS = path.join(import.meta.dirname, "..", "..", "..", "dist", "bindings", "microsoft", "graphics", "canvas", "CanvasDevice.js");
const IS_AVAILABLE = existsSync(NATIVE_LIBRARY) && existsSync(BINDINGS);
const POSITION_X = 12;
const POSITION_Y = 34;
const WHEEL_DELTA = 120;if (IS_AVAILABLE) {
  roInitialize(1);
  initWindowsAppSdk();
}

const fakeSender = {} satisfies Partial<UIElement>;
// oxlint-disable-next-line -- a fake stands for the WinUI class: the handlers read only what it carries
const SENDER = fakeSender as UIElement;

function asPointerArguments(fake: object) {
  // oxlint-disable-next-line -- the same fake, for the arguments
  return fake as PointerRoutedEventArgs;
}

function fakeArguments(options: Parameters<typeof plainArguments>[0]) {
  return asPointerArguments(plainArguments(options));
}

function plainArguments({ updateKind, isLeft = false, wheel = 0, isHorizontal = false }: {
  updateKind: number;
  isLeft?: boolean;
  wheel?: number;
  isHorizontal?: boolean;
}) {
  return {
    keyModifiers: VirtualKeyModifiers.Control | VirtualKeyModifiers.Shift,
    getCurrentPoint() {
      return {
        position: {
          x: POSITION_X,
          y: POSITION_Y
        },
        pointerId: 7,
        pointerDeviceType: InputPointerDeviceType.Mouse,
        properties: {
          pointerUpdateKind: updateKind,
          isLeftButtonPressed: isLeft,
          isRightButtonPressed: false,
          isMiddleButtonPressed: false,
          isPrimary: true,
          pressure: 0.5,
          mouseWheelDelta: wheel,
          isHorizontalMouseWheel: isHorizontal
        }
      };
    }
  };
}

function setup() {
  const canvas = createCanvas2D();
  const control = {} satisfies Partial<UIElement>;
  const calls: string[] = [];
  const handlers = pointerHandlers({
    canvas,
    // oxlint-disable-next-line -- the fake stands for the control: only the arguments' getCurrentPoint is read
    element: () => control as UIElement,
    user: {
      onpointerpressed() {
        calls.push("user");
      }
    }
  });
  const received: CanvasEvent[] = [];
  for (const type of ["pointerdown", "mousedown", "pointerup", "click", "wheel"]) {
    canvas.addEventListener(type, event => received.push(event));
  }

  return {
    handlers,
    received,
    calls,
    canvas
  };
}

test("a pressed pointer reaches listeners as pointerdown and mousedown with DOM fields", { skip: !IS_AVAILABLE }, () => {
  const { handlers, received, calls } = setup();
  handlers.onpointerpressed(
    SENDER, fakeArguments({
      updateKind: InputPointerUpdateKind.LeftButtonPressed,
      isLeft: true
    })
  );
  assert.deepEqual(received.map(event => event.type), ["pointerdown", "mousedown"]);
  const [event] = received;
  assert.equal(event?.["offsetX"], POSITION_X);
  assert.equal(event?.["offsetY"], POSITION_Y);
  assert.equal(event?.["button"], 0);
  assert.equal(event?.["buttons"], 1);
  assert.equal(event?.["pointerType"], "mouse");
  assert.equal(event?.["ctrlKey"], true);
  assert.equal(event?.["shiftKey"], true);
  assert.equal(event?.["altKey"], false);
  assert.deepEqual(calls, ["user"]);
});

test("a release names the released button and also raises click", { skip: !IS_AVAILABLE }, () => {
  const { handlers, received } = setup();
  handlers.onpointerreleased(
    SENDER, fakeArguments({
      updateKind: InputPointerUpdateKind.LeftButtonReleased
    })
  );
  assert.deepEqual(received.map(event => event.type), ["pointerup", "click"]);
  assert.equal(received[0]?.["button"], 0);
  assert.equal(received[0]?.["buttons"], 0);
});

test("the wheel reaches listeners with deltaY pointing the DOM way", { skip: !IS_AVAILABLE }, () => {
  const { handlers, received } = setup();
  handlers.onpointerwheelchanged(
    SENDER, fakeArguments({
      updateKind: InputPointerUpdateKind.Other,
      wheel: WHEEL_DELTA
    })
  );
  assert.equal(received[0]?.type, "wheel");
  assert.equal(received[0]?.["deltaY"], -WHEEL_DELTA);
  assert.equal(received[0]?.["deltaX"], 0);
  handlers.onpointerwheelchanged(
    SENDER, fakeArguments({
      updateKind: InputPointerUpdateKind.Other,
      wheel: WHEEL_DELTA,
      isHorizontal: true
    })
  );
  assert.equal(received[1]?.["deltaX"], WHEEL_DELTA);
  assert.equal(received[1]?.["deltaY"], 0);
});

test("a listener's preventDefault reaches the dispatch result", { skip: !IS_AVAILABLE }, () => {
  const { canvas } = setup();
  canvas.addEventListener("wheel", event => event.preventDefault());
  assert.equal(canvas.dispatchEvent({ type: "wheel" }), false);
  assert.equal(canvas.dispatchEvent({ type: "pointerdown" }), true);
});

test("a listener's preventDefault marks the WinUI event handled", { skip: !IS_AVAILABLE }, () => {
  const { handlers, canvas } = setup();
  canvas.addEventListener("wheel", event => event.preventDefault());
  const prevented = {
    ...plainArguments({
      updateKind: InputPointerUpdateKind.Other,
      wheel: WHEEL_DELTA
    }),
    handled: false
  };
  handlers.onpointerwheelchanged(SENDER, asPointerArguments(prevented));
  assert.equal(prevented.handled, true);
  const allowed = {
    ...plainArguments({
      updateKind: InputPointerUpdateKind.LeftButtonPressed,
      isLeft: true
    }),
    handled: false
  };
  handlers.onpointerpressed(SENDER, asPointerArguments(allowed));
  assert.equal(allowed.handled, false, "no listener prevented the press");
});

test("arguments that are not pointer data raise no DOM event but still call the app's handler", { skip: !IS_AVAILABLE }, () => {
  const { handlers, received, calls } = setup();
  handlers.onpointerpressed(SENDER, asPointerArguments({}));
  assert.equal(received.length, 0);
  assert.deepEqual(calls, ["user"]);
});
