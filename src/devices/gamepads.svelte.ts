import { Gamepad, GamepadButtons } from "./bindings.ts";
import type { Delivery } from "./delivery.ts";
import type { Subscription } from "./live.svelte.ts";
import { liveTracker, subscriptionOfStaticEvent } from "./live.svelte.ts";

/** One reading of a gamepad: sticks from -1 to 1, triggers from 0 to 1. */
export interface GamepadSample {
  readonly timestamp: bigint;

  /** The buttons held, as the bits of `GamepadButtons`. */
  readonly buttons: number;
  readonly leftTrigger: number;
  readonly rightTrigger: number;
  readonly leftThumbstickX: number;
  readonly leftThumbstickY: number;
  readonly rightThumbstickX: number;
  readonly rightThumbstickY: number;
}

/** A connected gamepad. */
export interface GamepadInfo {
  readonly isWireless: boolean;

  /** Reads the gamepad now; call it each frame, not in a getter. */
  read(): GamepadSample;
}

/** The reads and events `gamepads` uses; a test stands in for them. */
export interface GamepadSource {
  list(): readonly GamepadInfo[];
  subscriptions: readonly Subscription[];
}

/**
 * The gamepad source over `Windows.Gaming.Input.Gamepad`.
 *
 * @returns The gamepads now connected, and the added and removed events.
 */
export function windowsGamepadSource() {
  return {
    list: () => [...Gamepad.gamepads ?? []].map(gamepad => ({
      isWireless: gamepad.isWireless,
      read: () => gamepad.getCurrentReading()
    })),
    subscriptions: [
      subscriptionOfStaticEvent({
        add: handler => Gamepad.add_GamepadAdded(handler),
        remove: token => Gamepad.remove_GamepadAdded(token)
      }),
      subscriptionOfStaticEvent({
        add: handler => Gamepad.add_GamepadRemoved(handler),
        remove: token => Gamepad.remove_GamepadRemoved(token)
      })
    ]
  } satisfies GamepadSource;
}

/**
 * The names of the buttons held in a sample.
 *
 * @param sample - A reading of a gamepad.
 * @returns The `GamepadButtons` names whose bit is set, such as `A` and `DPadUp`.
 */
export function pressedButtons(sample: GamepadSample) {
  return Object.entries(GamepadButtons).flatMap(([name, bit]) => {
    const isPressed = bit !== 0 && (sample.buttons & bit) === bit;
    return isPressed ? [name] : [];
  });
}

/** What `gamepads` takes. */
export interface GamepadsOptions {
  /** Where the gamepads come from; the default is Windows. */
  readonly source?: GamepadSource;

  /** How a change reaches the UI thread; the default runs on its dispatcher queue. */
  readonly deliver?: Delivery;
}

/**
 * The connected gamepads, live: the list updates as a controller is plugged
 * in or removed (`Gamepad.GamepadAdded` and `GamepadRemoved`). To read the
 * sticks and buttons, call `read()` on a gamepad in a frame loop.
 *
 * Windows delivers gamepad input to a window that has focus, so a background
 * process reads neutral values.
 *
 * @param options - Where the gamepads come from, and how a change is delivered.
 * @returns `gamepads` as a reactive getter.
 */
export function gamepads(options: GamepadsOptions = {}) {
  const source = options.source ?? windowsGamepadSource();
  const track = liveTracker({
    subscriptions: source.subscriptions,
    ...options.deliver === undefined ? {} : { deliver: options.deliver }
  });
  return {
    get gamepads() {
      track();
      return source.list();
    }
  };
}
