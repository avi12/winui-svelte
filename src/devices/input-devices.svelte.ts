import type { Delivery } from "./delivery.ts";
import { deviceChanges } from "./device-changes.ts";
import type { DeviceChangesOptions } from "./device-changes.ts";
import type { InputSource } from "./input-capabilities.ts";
import { readInputCapabilities } from "./input-capabilities.ts";
import { DeviceInterfaceClass, selectorOfInterfaceClasses } from "./interface-classes.ts";
import { liveReader } from "./live.svelte.ts";

/** What `inputDevices` takes. */
export interface InputDevicesOptions {
  /** Where the reads come from; the default is Windows. */
  readonly source?: InputSource;

  /** How a change reaches the UI thread; the default runs on its dispatcher queue. */
  readonly deliver?: Delivery;

  /** Makes the watcher of input devices coming and going; a test stands in for it. */
  readonly createSource?: DeviceChangesOptions["createSource"];
}

const INPUT_CLASSES = [
  DeviceInterfaceClass.mouse,
  DeviceInterfaceClass.keyboard,
  DeviceInterfaceClass.humanInterfaceDevice
] as const;

/**
 * The input devices on the machine, read live: a mouse, a keyboard, touch and
 * pen, and whether any of them can hover. Every field is reactive and
 * follows hot-plugging (a mouse plugged in, a touch screen attached): read it
 * in markup, `$derived` or `$effect`. Windows has no event for "a mouse
 * appeared", so a watcher of the mouse, keyboard and HID device interfaces
 * says when to read again.
 *
 * `MouseDevice` (the relative motion events) is not here: it needs a window's
 * UI view, which an unpackaged app has no `CoreWindow` for.
 *
 * @param options - Where the reads come from, and how a change is delivered.
 * @returns The capabilities as reactive getters, and `capabilities` as one object.
 */
export function inputDevices(options: InputDevicesOptions = {}) {
  const { source, deliver, createSource } = options;
  const read = liveReader({
    read: () => readInputCapabilities(source),
    subscriptions: [
      deviceChanges({
        selector: selectorOfInterfaceClasses(...INPUT_CLASSES),
        ...createSource === undefined ? {} : { createSource }
      })
    ],
    deliver
  });
  return {
    get capabilities() {
      return read();
    },
    get hasMouse() {
      return read().hasMouse;
    },
    get mouseButtons() {
      return read().mouseButtons;
    },
    get hasWheel() {
      const { hasVerticalWheel, hasHorizontalWheel } = read();
      return hasVerticalWheel || hasHorizontalWheel;
    },
    get hasKeyboard() {
      return read().hasKeyboard;
    },
    get hasTouch() {
      return read().hasTouch;
    },
    get touchContacts() {
      return read().touchContacts;
    },
    get hasPen() {
      return read().hasPen;
    },
    get canHover() {
      return read().canHover;
    }
  };
}
