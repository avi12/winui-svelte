import { DomErrorName, domException } from "./dom-exception.ts";
import { defineProperty } from "./install.ts";
import { createCursorReader } from "#src/tray/native.js";
import { createKeyStateReader, createScreenPixelReader } from "#src/web-apis/native.js";

const POLL_MILLISECONDS = 16;
const VIRTUAL_KEY_LEFT_BUTTON = 0x01;
const VIRTUAL_KEY_ESCAPE = 0x1b;
const HEX_RADIX = 16;
const HEX_DIGITS = 2;

/** One screen pixel the user picked. */
export interface PickedPixel {
  /** Screen coordinates of the pixel. */
  readonly x: number;
  readonly y: number;
  readonly red: number;
  readonly green: number;
  readonly blue: number;
}

/** Something that waits for the user to pick a pixel anywhere on the screen. */
export interface ScreenPicker {
  /**
   * Waits for the pick.
   *
   * @param options - A signal that stops the wait; it rejects with the signal's reason.
   * @returns The pixel, or nothing when the user cancelled.
   */
  pick(options: { readonly signal: AbortSignal | undefined }): Promise<PickedPixel | undefined>;
}

/** What `installEyeDropper` takes. */
export interface EyeDropperInstallOptions {
  /** Stands in for the Windows screen; the tests give one. */
  readonly picker?: ScreenPicker;
}

/** What `EyeDropper.open` resolves with: the standard `sRGBHex`, and the pixel's place on the screen. */
export interface ColorSelectionResult {
  /** The picked color as `#rrggbb`. */
  readonly sRGBHex: string;

  /** Windows only: where on the screen it was picked, in pixels. */
  readonly position: {
    readonly x: number;
    readonly y: number;
  };
}

/** The options `EyeDropper.open` takes. */
export interface ColorSelectionOptions {
  readonly signal?: AbortSignal;
}

function delay(milliseconds: number) {
  return new Promise(resolve => {
    setTimeout(resolve, milliseconds);
  });
}

/**
 * The real picker: waits for the next left button press anywhere on the
 * screen and reads the pixel under the cursor; Escape cancels. It only reads
 * the keyboard and the pointer, and the click goes on to the window under it.
 *
 * @returns The picker.
 */
export function windowsScreenPicker() {
  const readCursor = createCursorReader();
  const readPixel = createScreenPixelReader();
  const isDown = createKeyStateReader();

  return {
    async pick({ signal }) {
      let isHeld = isDown(VIRTUAL_KEY_LEFT_BUTTON);
      for (;;) {
        signal?.throwIfAborted();
        const isCancelled = isDown(VIRTUAL_KEY_ESCAPE);
        if (isCancelled) {
          return undefined;
        }

        const isPressed = isDown(VIRTUAL_KEY_LEFT_BUTTON);
        const isNewPress = isPressed && !isHeld;
        isHeld = isPressed;

        if (isNewPress) {
          const position = readCursor();
          const color = readPixel(position);
          const isReadable = color !== undefined;
          if (isReadable) {
            return {
              ...position,
              ...color
            };
          }
        }

        await delay(POLL_MILLISECONDS);
      }
    }
  } satisfies ScreenPicker;
}

interface InstalledEyeDropper {
  readonly picker: ScreenPicker;
  isOpen: boolean;
}

let installed: InstalledEyeDropper | undefined;

function hexOf(channel: number) {
  return channel.toString(HEX_RADIX).padStart(HEX_DIGITS, "0");
}

/** The web `EyeDropper`: `await new EyeDropper().open()` resolves with the color of the pixel the user clicks. */
export class EyeDropper {
  /**
   * Waits for the user to click a pixel anywhere on the screen.
   *
   * @param options - A `signal` that cancels the wait.
   * @returns The pixel's color as `{ sRGBHex }`, with its screen position.
   * @throws {DOMException} `AbortError` when the user cancels or the signal aborts; `InvalidStateError` while
   * another `open` waits.
   */
  async open(options: ColorSelectionOptions = {}) {
    if (!installed) {
      throw domException({
        name: DomErrorName.INVALID_STATE,
        message: "EyeDropper is not installed: call installEyeDropper() first"
      });
    }

    const state = installed;
    if (state.isOpen) {
      throw domException({
        name: DomErrorName.INVALID_STATE,
        message: "An EyeDropper is already open"
      });
    }

    options.signal?.throwIfAborted();
    state.isOpen = true;
    try {
      const picked = await state.picker.pick({ signal: options.signal });
      const isCancelled = picked === undefined;
      if (isCancelled) {
        throw domException({
          name: DomErrorName.ABORT,
          message: "The user canceled the selection"
        });
      }

      return {
        sRGBHex: `#${hexOf(picked.red)}${hexOf(picked.green)}${hexOf(picked.blue)}`,
        position: {
          x: picked.x,
          y: picked.y
        }
      };
    } finally {
      state.isOpen = false;
    }
  }

  get [Symbol.toStringTag]() {
    return "EyeDropper";
  }
}

/**
 * Defines `globalThis.EyeDropper`. Nothing is defined until this is called.
 *
 * @param options - Test stand-ins.
 * @returns The function that takes it away again.
 */
export function installEyeDropper(options: EyeDropperInstallOptions = {}) {
  const previous = installed;
  installed = {
    picker: options.picker ?? windowsScreenPicker(),
    isOpen: false
  };
  const uninstall = defineProperty({
    name: "EyeDropper",
    value: EyeDropper
  });
  return () => {
    uninstall();
    installed = previous;
  };
}
