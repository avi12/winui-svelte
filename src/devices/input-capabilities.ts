import {
  KeyboardCapabilities,
  MouseCapabilities,
  PointerDevice,
  PointerDeviceType,
  TouchCapabilities
} from "./bindings.ts";

/** One pointing device Windows knows (`PointerDevice`). */
export interface PointerDeviceInfo {
  readonly type: PointerDeviceType;
  readonly isIntegrated: boolean;

  /** How many contacts it tracks at once (a touch screen's fingers). */
  readonly maxContacts: number;
}

/**
 * What the machine has for input, read from `MouseCapabilities`,
 * `KeyboardCapabilities`, `TouchCapabilities` and `PointerDevice`. The one
 * reader the input runes and the pointer media features (`hover`, `pointer`
 * and their `any-` forms) share.
 */
export interface InputCapabilities {
  readonly hasMouse: boolean;
  readonly mouseButtons: number;
  readonly hasVerticalWheel: boolean;
  readonly hasHorizontalWheel: boolean;

  /** The user swapped the primary and secondary buttons. */
  readonly hasSwappedButtons: boolean;
  readonly hasKeyboard: boolean;
  readonly hasTouch: boolean;

  /** How many touch contacts the best digitizer tracks at once. */
  readonly touchContacts: number;
  readonly hasPen: boolean;
  readonly hasTouchpad: boolean;
  readonly pointerDevices: readonly PointerDeviceInfo[];

  /** Some pointer can hover: a mouse, a touchpad or a pen (the `any-hover: hover` feature). */
  readonly canHover: boolean;

  /** Some pointer is precise: a mouse, a touchpad or a pen (`any-pointer: fine`). */
  readonly hasFinePointer: boolean;

  /** Some pointer is a finger on a screen (`any-pointer: coarse`). */
  readonly hasCoarsePointer: boolean;
}

/** The Windows reads `readInputCapabilities` makes; a test stands in for them. */
export interface InputSource {
  mouse(): {
    isPresent: boolean;
    buttons: number;
    hasVerticalWheel: boolean;
    hasHorizontalWheel: boolean;
    hasSwappedButtons: boolean;
  };
  hasKeyboard(): boolean;
  touch(): {
    isPresent: boolean;
    contacts: number;
  };
  pointerDevices(): readonly PointerDeviceInfo[];
}

/**
 * The input source over Windows.Devices.Input.
 *
 * @returns Reads of the live capability classes.
 */
export function windowsInputSource() {
  return {
    mouse() {
      const mouse = new MouseCapabilities();
      return {
        isPresent: mouse.mousePresent !== 0,
        buttons: mouse.numberOfButtons,
        hasVerticalWheel: mouse.verticalWheelPresent !== 0,
        hasHorizontalWheel: mouse.horizontalWheelPresent !== 0,
        hasSwappedButtons: mouse.swapButtons !== 0
      };
    },
    hasKeyboard: () => new KeyboardCapabilities().keyboardPresent !== 0,
    touch() {
      const touch = new TouchCapabilities();
      return {
        isPresent: touch.touchPresent !== 0,
        contacts: touch.contacts
      };
    },
    pointerDevices: () => [...PointerDevice.getPointerDevices() ?? []].map(device => ({
      type: device.pointerDeviceType,
      isIntegrated: device.isIntegrated,
      maxContacts: device.maxContacts
    }))
  } satisfies InputSource;
}

/**
 * Reads what the machine has for input right now.
 *
 * @param source - Where the reads come from; the default is Windows.
 * @returns The capabilities.
 */
export function readInputCapabilities(source: InputSource = windowsInputSource()) {
  const mouse = source.mouse();
  const touch = source.touch();
  const pointerDevices = source.pointerDevices();
  const hasPen = pointerDevices.some(device => device.type === PointerDeviceType.Pen);
  const hasTouchpad = pointerDevices.some(device => device.type === PointerDeviceType.Touchpad);
  const hasFinePointer = mouse.isPresent || hasPen || hasTouchpad;
  return {
    hasMouse: mouse.isPresent,
    mouseButtons: mouse.buttons,
    hasVerticalWheel: mouse.hasVerticalWheel,
    hasHorizontalWheel: mouse.hasHorizontalWheel,
    hasSwappedButtons: mouse.hasSwappedButtons,
    hasKeyboard: source.hasKeyboard(),
    hasTouch: touch.isPresent,
    touchContacts: touch.contacts,
    hasPen,
    hasTouchpad,
    pointerDevices,
    canHover: hasFinePointer,
    hasFinePointer,
    hasCoarsePointer: touch.isPresent
  } satisfies InputCapabilities;
}
