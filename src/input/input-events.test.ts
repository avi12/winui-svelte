import type { PointerEvent } from "./dom-event.ts";
import { enableInputEvents } from "./events.ts";
import { keyboardFields } from "./keyboard-fields.ts";
import type { KeyArguments } from "./keyboard-fields.ts";
import { hasPointerCapture, releasePointerCapture, setPointerCapture } from "./pointer-capture.ts";
import type { CaptureControl } from "./pointer-capture.ts";
import { pointerFields, PointerType } from "./pointer-fields.ts";
import type { PointerArguments } from "./pointer-fields.ts";
import { eventAdapters } from "#src/renderer/host/event-adapters.js";
import { InputPointerDeviceType } from "#winui/microsoft/ui/input/PointerDeviceType";
import { InputPointerUpdateKind } from "#winui/microsoft/ui/input/PointerUpdateKind";
import type { UIElement } from "#winui/microsoft/ui/xaml/UIElement";
import { VirtualKey } from "#winui/windows/system/VirtualKey";
import { VirtualKeyModifiers } from "#winui/windows/system/VirtualKeyModifiers";
import { CoreVirtualKeyStates } from "#winui/windows/ui/core/CoreVirtualKeyStates";
import assert from "node:assert/strict";
import { test } from "node:test";

// The web events built from fake WinUI arguments: the tables and the adapters
// are called the way WinUI calls them, with no window and no input.

const SCAN_CODE_RIGHT_SHIFT = 0x36;
const PEN_PRESSURE = 0.75;
const PEN_TILT_X = 30;
const PEN_TILT_Y = -15;
const POINTER_ID = 9;
const POSITIONS = [
  {
    x: 1,
    y: 2
  },
  {
    x: 3,
    y: 4
  },
  {
    x: 5,
    y: 6
  }
];

type Listener = (sender: unknown, args: unknown) => void;

function fakePoint({ position, pressure = PEN_PRESSURE }: {
  position: {
    x: number;
    y: number;
  };
  pressure?: number;
}) {
  return {
    position,
    pointerId: POINTER_ID,
    pointerDeviceType: InputPointerDeviceType.Pen,
    properties: {
      pointerUpdateKind: InputPointerUpdateKind.LeftButtonPressed,
      isLeftButtonPressed: true,
      isRightButtonPressed: false,
      isMiddleButtonPressed: false,
      isPrimary: true,
      pressure,
      xTilt: PEN_TILT_X,
      yTilt: PEN_TILT_Y,
      twist: 0,
      mouseWheelDelta: 0,
      isHorizontalMouseWheel: false
    }
  };
}

function fakePointerArguments() {
  const points = POSITIONS.map(position => fakePoint({ position }));
  const current = points.at(-1);
  return {
    keyModifiers: VirtualKeyModifiers.Control,
    handled: false,
    pointer: {
      pointerId: POINTER_ID
    },
    getCurrentPoint() {
      return current;
    },
    // WinUI lists the points newest first.
    getIntermediatePoints() {
      const newestFirst = [...points].reverse();
      return {
        size: newestFirst.length,
        getAt: (iPoint: number) => newestFirst[iPoint]
      };
    }
  };
}

function asPointerArguments(fake: object) {
  // oxlint-disable-next-line -- a fake stands for the WinUI class: only the members read above exist
  return fake as PointerArguments;
}

function asElement(fake: object) {
  // oxlint-disable-next-line -- a fake stands for the control: the adapters call only the members faked
  return fake as UIElement;
}

function fakeKey({ key, isExtendedKey = false, scanCode = 0, isHeld = false, isKeyReleased = false }: {
  key: VirtualKey;
  isExtendedKey?: boolean;
  scanCode?: number;
  isHeld?: boolean;
  isKeyReleased?: boolean;
}) {
  const fake = {
    key,
    keyStatus: {
      isExtendedKey,
      scanCode,
      wasKeyDown: isHeld,
      isKeyReleased
    }
  };
  // oxlint-disable-next-line -- the fields read only key and keyStatus
  return fake as KeyArguments;
}

function states({ down, locked = [] }: {
  down: VirtualKey[];
  locked?: VirtualKey[];
}) {
  return function stateOf(key: VirtualKey) {
    const isDown = down.includes(key);
    const isLocked = locked.includes(key);
    return (isDown ? CoreVirtualKeyStates.Down : 0) | (isLocked ? CoreVirtualKeyStates.Locked : 0);
  };
}

test("a pen's pressure, tilt and device name reach the fields", () => {
  const fields = pointerFields({
    args: asPointerArguments(fakePointerArguments()),
    element: asElement({})
  });
  assert.equal(fields.pointerType, PointerType.pen);
  assert.equal(fields.pressure, PEN_PRESSURE);
  assert.equal(fields.tiltX, PEN_TILT_X);
  assert.equal(fields.tiltY, PEN_TILT_Y);
  assert.equal(fields.pointerId, POINTER_ID);
  assert.equal(fields.ctrlKey, true);
  assert.equal(fields.shiftKey, false);
  assert.equal(fields.button, 0);
  assert.equal(fields.buttons, 1);
});

test("coalesced events are the points since the last event, oldest first", () => {
  const fields = pointerFields({
    args: asPointerArguments(fakePointerArguments()),
    element: asElement({})
  });
  const coalesced = fields.getCoalescedEvents();
  assert.deepEqual(coalesced.map(({ x, y }) => [x, y]), POSITIONS.map(({ x, y }) => [x, y]));
  assert.deepEqual(coalesced[0]?.getCoalescedEvents(), []);
});

test("without intermediate points the event is its own coalesced event", () => {
  const fake = {
    ...fakePointerArguments(),
    getIntermediatePoints: () => null
  };
  const fields = pointerFields({
    args: asPointerArguments(fake),
    element: asElement({})
  });
  assert.equal(fields.getCoalescedEvents().length, 1);
});

test("letters follow Shift and Caps Lock, digits and arrows are named as on the web", () => {
  const letterA = fakeKey({ key: VirtualKey.A });
  assert.deepEqual(
    [
      keyboardFields({
        args: letterA,
        stateOf: states({ down: [] })
      }).key,
      keyboardFields({
        args: letterA,
        stateOf: states({ down: [VirtualKey.Shift] })
      }).key,
      keyboardFields({
        args: letterA,
        stateOf: states({
          down: [],
          locked: [VirtualKey.CapitalLock]
        })
      }).key,
      keyboardFields({
        args: letterA,
        stateOf: states({
          down: [VirtualKey.Shift],
          locked: [VirtualKey.CapitalLock]
        })
      }).key
    ],
    ["a", "A", "A", "a"]
  );
  assert.equal(
    keyboardFields({
      args: letterA,
      stateOf: states({ down: [] })
    }).code, "KeyA"
  );
  const digit = keyboardFields({
    args: fakeKey({ key: VirtualKey.Number7 }),
    stateOf: states({ down: [] })
  });
  assert.deepEqual([digit.key, digit.code], ["7", "Digit7"]);
  const numpad = keyboardFields({
    args: fakeKey({ key: VirtualKey.NumberPad3 }),
    stateOf: states({ down: [] })
  });
  assert.deepEqual([numpad.key, numpad.code], ["3", "Numpad3"]);
  const arrow = keyboardFields({
    args: fakeKey({ key: VirtualKey.Left }),
    stateOf: states({ down: [] })
  });
  assert.deepEqual([arrow.key, arrow.code], ["ArrowLeft", "ArrowLeft"]);
  const functionKey = keyboardFields({
    args: fakeKey({ key: VirtualKey.F5 }),
    stateOf: states({ down: [] })
  });
  assert.deepEqual([functionKey.key, functionKey.code], ["F5", "F5"]);
  const space = keyboardFields({
    args: fakeKey({ key: VirtualKey.Space }),
    stateOf: states({ down: [] })
  });
  assert.deepEqual([space.key, space.code], [" ", "Space"]);
  const back = keyboardFields({
    args: fakeKey({ key: VirtualKey.Back }),
    stateOf: states({ down: [] })
  });
  assert.equal(back.key, "Backspace");
});

test("the modifier keys name their side from the key status", () => {
  const leftControl = keyboardFields({
    args: fakeKey({ key: VirtualKey.Control }),
    stateOf: states({ down: [] })
  });
  const rightControl = keyboardFields({
    args: fakeKey({
      key: VirtualKey.Control,
      isExtendedKey: true
    }),
    stateOf: states({ down: [] })
  });
  assert.deepEqual([leftControl.key, leftControl.code, rightControl.code], ["Control", "ControlLeft", "ControlRight"]);
  const rightShift = keyboardFields({
    args: fakeKey({
      key: VirtualKey.Shift,
      scanCode: SCAN_CODE_RIGHT_SHIFT
    }),
    stateOf: states({ down: [] })
  });
  assert.equal(rightShift.code, "ShiftRight");
  const alt = keyboardFields({
    args: fakeKey({ key: VirtualKey.Menu }),
    stateOf: states({ down: [] })
  });
  assert.deepEqual([alt.key, alt.code], ["Alt", "AltLeft"]);
});

test("modifiers come from the keyboard state and repeat from the key status", () => {
  const fields = keyboardFields({
    args: fakeKey({
      key: VirtualKey.S,
      isHeld: true
    }),
    stateOf: states({ down: [VirtualKey.Control, VirtualKey.LeftWindows] })
  });
  assert.equal(fields.ctrlKey, true);
  assert.equal(fields.metaKey, true);
  assert.equal(fields.altKey, false);
  assert.equal(fields.repeat, true);
  assert.equal(fields.isComposing, false);
  const released = keyboardFields({
    args: fakeKey({
      key: VirtualKey.S,
      isHeld: true,
      isKeyReleased: true
    }),
    stateOf: states({ down: [] })
  });
  assert.equal(released.repeat, false);
});

test("a key no table names is Unidentified", () => {
  const fields = keyboardFields({
    args: fakeKey({ key: VirtualKey.Help }),
    stateOf: states({ down: [] })
  });
  assert.equal(fields.key, "Unidentified");
});

class FakeControl {
  readonly listeners = new Map<string, Listener>();

  private listen(name: string) {
    return (listener: Listener) => {
      this.listeners.set(name, listener);
      return () => this.listeners.delete(name);
    };
  }

  onPointerPressed = this.listen("pressed");
  onGotFocus = this.listen("gotfocus");
}

test("enableInputEvents adds the web names, with no other module touched before", () => {
  enableInputEvents();
  for (const name of ["pointerdown", "pointerup", "pointermove", "pointerenter", "pointerleave", "pointercancel", "wheel", "keydown", "keyup", "focusin", "focusout"]) {
    assert.ok(eventAdapters.has(name), name);
  }
});

test("a pointerdown handler gets the event, preventDefault marks the WinUI event handled", () => {
  enableInputEvents();
  const control = new FakeControl();
  const received: PointerEvent[] = [];
  const stop = eventAdapters.get("pointerdown")?.subscribe({
    control: asElement(control),
    handler(event: PointerEvent) {
      received.push(event);
      event.preventDefault();
    }
  });
  const args = fakePointerArguments();
  control.listeners.get("pressed")?.({}, args);
  assert.equal(received.length, 1);
  assert.equal(received[0]?.type, "pointerdown");
  assert.equal(received[0]?.pointerType, PointerType.pen);
  assert.equal(received[0]?.currentTarget, control);
  assert.equal(received[0]?.target, control);
  assert.equal(received[0]?.defaultPrevented, true);
  assert.equal(args.handled, true);
  stop?.();
  assert.equal(control.listeners.has("pressed"), false);
});

test("a focusin handler gets an event with a target", () => {
  enableInputEvents();
  const control = new FakeControl();
  const types: string[] = [];
  eventAdapters.get("focusin")?.subscribe({
    control: asElement(control),
    handler: (event: {
      type: string;
      target: unknown;
    }) => types.push(`${event.type} ${event.target === control}`)
  });
  control.listeners.get("gotfocus")?.({}, {});
  assert.deepEqual(types, ["focusin true"]);
});

test("pointer capture goes through the pointer the element heard, by id", () => {
  enableInputEvents();
  const calls: string[] = [];
  class CapturingControl extends FakeControl {
    readonly pointerCaptures = {
      size: 1,
      getAt: () => ({ pointerId: POINTER_ID })
    };

    capturePointer(pointer: { pointerId: number }) {
      calls.push(`capture ${pointer.pointerId}`);
      return true;
    }

    releasePointerCapture(pointer: { pointerId: number }) {
      calls.push(`release ${pointer.pointerId}`);
    }
  }
  const control = new CapturingControl();
  // oxlint-disable-next-line -- the fake has the three members the capture reads
  const captureControl = control as unknown as CaptureControl;
  assert.throws(() => setPointerCapture({
    control: captureControl,
    pointerId: POINTER_ID
  }), /has not reached/u);
  eventAdapters.get("pointerdown")?.subscribe({
    control: asElement(control),
    handler: () => undefined
  });
  control.listeners.get("pressed")?.({}, fakePointerArguments());
  assert.equal(
    setPointerCapture({
      control: captureControl,
      pointerId: POINTER_ID
    }), true
  );
  assert.equal(
    hasPointerCapture({
      control: captureControl,
      pointerId: POINTER_ID
    }), true
  );
  assert.equal(
    hasPointerCapture({
      control: captureControl,
      pointerId: 1
    }), false
  );
  releasePointerCapture({
    control: captureControl,
    pointerId: POINTER_ID
  });
  assert.deepEqual(calls, [`capture ${POINTER_ID}`, `release ${POINTER_ID}`]);
});
