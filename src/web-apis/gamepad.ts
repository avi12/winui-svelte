import { defineNavigatorProperty, defineProperty } from "./install.ts";
import { listenToSource } from "./source-events.ts";
import { windowEvents } from "./window-events.ts";
import type { Delivery } from "#src/devices/delivery.js";
import type { GamepadSample } from "#src/devices/gamepad.js";
import { GamepadButtons, windowsGamepadSource } from "#src/devices/gamepad.js";
import type { Subscription } from "#src/devices/live.svelte.js";
import { Gamepad as WindowsGamepad } from "#winui/windows/gaming/input/Gamepad";

const SLOT_COUNT = 4;
const STANDARD_AXES = 4;
const PRESSED_THRESHOLD = 0.1;
const FULL_PERCENT = 100;
const STANDARD_ID = "Xbox Controller (STANDARD GAMEPAD)";

/** The buttons of the standard mapping, by index; `null` has no counterpart in Windows (the guide button). */
const BUTTON_ORDER = [
  GamepadButtons.A,
  GamepadButtons.B,
  GamepadButtons.X,
  GamepadButtons.Y,
  GamepadButtons.LeftShoulder,
  GamepadButtons.RightShoulder,
  null,
  null,
  GamepadButtons.View,
  GamepadButtons.Menu,
  GamepadButtons.LeftThumbstick,
  GamepadButtons.RightThumbstick,
  GamepadButtons.DPadUp,
  GamepadButtons.DPadDown,
  GamepadButtons.DPadLeft,
  GamepadButtons.DPadRight,
  null
] as const;
const LEFT_TRIGGER_INDEX = 6;
const RIGHT_TRIGGER_INDEX = 7;

/** The motors of a gamepad, each from 0 to 1. */
export interface GamepadVibrationLevels {
  readonly leftMotor: number;
  readonly rightMotor: number;
  readonly leftTrigger: number;
  readonly rightTrigger: number;
}

/** The battery of a wireless gamepad. */
export interface GamepadBatteryLevel {
  /** 0 to 100, or null when the controller does not say. */
  readonly percent: number | null;
}

/** A physical gamepad as a backend reports it; the same object stands for it for as long as it is connected. */
export interface GamepadDevice {
  readonly isWireless: boolean;
  read(): GamepadSample;
  vibrate(levels: GamepadVibrationLevels): void;
  battery(): GamepadBatteryLevel | null;
}

/** Stands between `navigator.getGamepads` and Windows; the tests give their own. */
export interface GamepadBackend {
  list(): readonly GamepadDevice[];
  readonly subscriptions: readonly Subscription[];
}

/** The `dual-rumble` effect of the Gamepad Extensions, plus the trigger motors Windows adds. */
export interface GamepadEffectParameters {
  readonly startDelay?: number;
  readonly duration?: number;
  readonly weakMagnitude?: number;
  readonly strongMagnitude?: number;

  /** The trigger motors of `trigger-rumble`. WinUI-only. */
  readonly leftTrigger?: number;
  readonly rightTrigger?: number;
}

/** The effects `GamepadHapticActuator.playEffect` plays; `trigger-rumble` is WinUI-only. */
export type GamepadEffectType = "dual-rumble" | "trigger-rumble";

/** How an effect ended. */
export type GamepadHapticsResult = "complete" | "preempted" | "invalid-parameter" | "not-supported";

const STOPPED = {
  leftMotor: 0,
  rightMotor: 0,
  leftTrigger: 0,
  rightTrigger: 0
} satisfies GamepadVibrationLevels;

function clampMagnitude(value: number | undefined) {
  return Math.min(1, Math.max(0, value ?? 0));
}

function isNumberOrMissing(value: number | undefined) {
  return value === undefined || Number.isFinite(value);
}

/** A button of the standard mapping. */
export class GamepadButton {
  // eslint-disable-next-line @typescript-eslint/naming-convention -- the standard member name
  readonly pressed: boolean;
  // eslint-disable-next-line @typescript-eslint/naming-convention -- the standard member name
  readonly touched: boolean;
  readonly value: number;

  /** Made by `navigator.getGamepads`. */
  constructor(value: number) {
    this.value = value;
    this.pressed = value > PRESSED_THRESHOLD;
    this.touched = this.pressed;
  }

  get [Symbol.toStringTag]() {
    return "GamepadButton";
  }
}

/** The motors of a gamepad: `gamepad.vibrationActuator`. */
export class GamepadHapticActuator {
  readonly type = "dual-rumble";
  private readonly device: GamepadDevice;
  private current: {
    readonly cancel: () => GamepadHapticsResult;
  } | undefined;

  /** Made by `navigator.getGamepads`. */
  constructor(device: GamepadDevice) {
    this.device = device;
  }

  /**
   * Plays a rumble.
   *
   * @param type - `dual-rumble`, or `trigger-rumble` for the trigger motors.
   * @param parameters - Delay, duration and the strength of each motor, 0 to 1.
   * @returns How it ended; a newer effect preempts this one.
   */
  async playEffect(type: GamepadEffectType, parameters: GamepadEffectParameters = {}) {
    const isKnown = type === "dual-rumble" || type === "trigger-rumble";
    if (!isKnown) {
      throw new TypeError(`'${String(type)}' is not a valid value for enumeration GamepadHapticEffectType`);
    }

    const isValid = [
      parameters.startDelay,
      parameters.duration,
      parameters.weakMagnitude,
      parameters.strongMagnitude,
      parameters.leftTrigger,
      parameters.rightTrigger
    ].every(isNumberOrMissing);
    if (!isValid) {
      return "invalid-parameter" as const;
    }

    this.current?.cancel();
    const levels = {
      leftMotor: clampMagnitude(parameters.strongMagnitude),
      rightMotor: clampMagnitude(parameters.weakMagnitude),
      leftTrigger: type === "trigger-rumble" ? clampMagnitude(parameters.leftTrigger) : 0,
      rightTrigger: type === "trigger-rumble" ? clampMagnitude(parameters.rightTrigger) : 0
    } satisfies GamepadVibrationLevels;
    return new Promise<GamepadHapticsResult>(resolve => {
      const timers: Array<ReturnType<typeof setTimeout>> = [];
      const entry = {
        cancel() {
          for (const timer of timers) {
            clearTimeout(timer);
          }

          resolve("preempted");
          return "preempted" as const;
        }
      };
      this.current = entry;
      timers.push(
        setTimeout(() => {
          this.device.vibrate(levels);
          timers.push(
            setTimeout(() => {
              this.device.vibrate(STOPPED);
              this.current = undefined;
              resolve("complete");
            }, Math.max(0, parameters.duration ?? 0))
          );
        }, Math.max(0, parameters.startDelay ?? 0))
      );
    });
  }

  /**
   * Stops any effect.
   *
   * @returns `complete`.
   */
  async reset() {
    this.current?.cancel();
    this.current = undefined;
    this.device.vibrate(STOPPED);
    return "complete" as const;
  }

  get [Symbol.toStringTag]() {
    return "GamepadHapticActuator";
  }
}

function axesOf(sample: GamepadSample) {
  return [
    sample.leftThumbstickX,
    -sample.leftThumbstickY,
    sample.rightThumbstickX,
    -sample.rightThumbstickY
  ];
}

function buttonsOf(sample: GamepadSample) {
  return BUTTON_ORDER.map((bit, iButton) => {
    const isLeftTrigger = iButton === LEFT_TRIGGER_INDEX;
    if (isLeftTrigger) {
      return new GamepadButton(sample.leftTrigger);
    }

    const isRightTrigger = iButton === RIGHT_TRIGGER_INDEX;
    if (isRightTrigger) {
      return new GamepadButton(sample.rightTrigger);
    }

    const isHeld = bit !== null && (sample.buttons & bit) === bit;
    return new GamepadButton(isHeld ? 1 : 0);
  });
}

/** A connected gamepad, in the standard mapping. */
export class Gamepad {
  readonly id = STANDARD_ID;
  readonly index: number;
  readonly mapping = "standard";
  readonly vibrationActuator: GamepadHapticActuator;
  // eslint-disable-next-line @typescript-eslint/naming-convention -- the standard member name
  connected = true;
  timestamp: number;
  axes: readonly number[] = Array.from<number>({ length: STANDARD_AXES }).fill(0);
  buttons: readonly GamepadButton[] = [];

  /** Whether it is connected without a cable. WinUI-only. */
  readonly isWireless: boolean;
  private readonly device: GamepadDevice;

  /** Made by `installGamepad`. */
  constructor({ device, index }: {
    device: GamepadDevice;
    index: number;
  }) {
    this.device = device;
    this.index = index;
    this.isWireless = device.isWireless;
    this.vibrationActuator = new GamepadHapticActuator(device);
    this.timestamp = performance.now();
    this.refresh();
  }

  /** The battery charge from 0 to 100, or null when a wired gamepad or the controller does not say. WinUI-only. */
  get batteryPercent() {
    return this.device.battery()?.percent ?? null;
  }

  /** Reads the sticks and buttons now. */
  refresh() {
    const sample = this.device.read();
    this.axes = axesOf(sample);
    this.buttons = buttonsOf(sample);
    this.timestamp = performance.now();
  }

  get [Symbol.toStringTag]() {
    return "Gamepad";
  }
}

/** The event of `gamepadconnected` and `gamepaddisconnected`. */
export class GamepadEvent extends Event {
  readonly gamepad: Gamepad;

  /** Made by `installGamepad`. */
  constructor(type: string, init: { gamepad: Gamepad }) {
    super(type);
    this.gamepad = init.gamepad;
  }
}

declare global {
  interface Navigator {
    /** The gamepad slots: four, each a `Gamepad` or null; defined by `installGamepad`. */
    getGamepads(): Array<Gamepad | null>;
  }
}

/**
 * The backend over `Windows.Gaming.Input.Gamepad`. Windows delivers gamepad
 * input to a window that has focus, so a background process reads neutral
 * values.
 *
 * @returns A backend for `installGamepad`.
 */
export function windowsGamepadBackend() {
  const devices = new WeakMap<WindowsGamepad, GamepadDevice>();
  return {
    list: () => [...WindowsGamepad.gamepads ?? []].map(native => {
      const known = devices.get(native);
      if (known) {
        return known;
      }

      const device = {
        isWireless: native.isWireless,
        read: () => native.getCurrentReading(),
        vibrate(levels) {
          native.vibration = levels;
        },
        battery() {
          const report = native.tryGetBatteryReport();
          const full = report?.fullChargeCapacityInMilliwattHours;
          const left = report?.remainingCapacityInMilliwattHours;
          const isKnown = full != null && left != null && full > 0;
          return { percent: isKnown ? Math.round(left / full * FULL_PERCENT) : null };
        }
      } satisfies GamepadDevice;
      devices.set(native, device);
      return device;
    }),
    subscriptions: windowsGamepadSource().subscriptions
  } satisfies GamepadBackend;
}

/** What `installGamepad` takes. */
export interface GamepadInstallOptions {
  /** Stands in for Windows; the tests give one. */
  readonly backend?: GamepadBackend;

  /** How a change reaches the thread the app runs on; the default is the UI thread's dispatcher queue. */
  readonly deliver?: Delivery;
}

/**
 * Defines `navigator.getGamepads()`, the `Gamepad`, `GamepadButton`,
 * `GamepadHapticActuator` and `GamepadEvent` globals, and fires
 * `gamepadconnected` and `gamepaddisconnected` on the global scope as
 * Windows reports controllers. A controller already connected fires
 * `gamepadconnected` on the first `getGamepads()` call, as a browser does.
 *
 * @param options - Test stand-ins.
 * @returns The function that takes it away again.
 */
export function installGamepad(options: GamepadInstallOptions = {}) {
  const backend = options.backend ?? windowsGamepadBackend();
  const events = windowEvents();
  const slots = Array.from<Gamepad | null>({ length: SLOT_COUNT }).fill(null);

  const known = new Map<GamepadDevice, Gamepad>();

  function sync() {
    const present = new Set(backend.list());
    for (const [device, gamepad] of known) {
      if (!present.has(device)) {
        gamepad.connected = false;
        slots[gamepad.index] = null;
        known.delete(device);
        events.dispatch(new GamepadEvent("gamepaddisconnected", { gamepad }));
      }
    }

    for (const device of present) {
      const iFree = slots.indexOf(null);
      const canAdd = !known.has(device) && iFree !== -1;
      if (canAdd) {
        const gamepad = new Gamepad({
          device,
          index: iFree
        });
        slots[iFree] = gamepad;
        known.set(device, gamepad);
        events.dispatch(new GamepadEvent("gamepadconnected", { gamepad }));
      }
    }
  }

  function getGamepads() {
    sync();
    for (const gamepad of known.values()) {
      gamepad.refresh();
    }

    return [...slots];
  }

  const stop = listenToSource({
    subscriptions: backend.subscriptions,
    onChange: sync,
    ...options.deliver === undefined ? {} : { deliver: options.deliver }
  });
  const uninstalls = [
    defineNavigatorProperty({
      name: "getGamepads",
      value: getGamepads
    }),
    defineProperty({
      name: "Gamepad",
      value: Gamepad
    }),
    defineProperty({
      name: "GamepadButton",
      value: GamepadButton
    }),
    defineProperty({
      name: "GamepadHapticActuator",
      value: GamepadHapticActuator
    }),
    defineProperty({
      name: "GamepadEvent",
      value: GamepadEvent
    })
  ];
  return () => {
    for (const uninstall of uninstalls.reverse()) {
      uninstall();
    }

    stop();
    events.uninstall();
  };
}
