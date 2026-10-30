import { systemMetric } from "./native.ts";
import { startTimer } from "./timers.ts";
import type { MediaDevices } from "#src/css/media/features.js";

// The pointing devices Windows reports through GetSystemMetrics: a mouse, and
// the digitizer's touch and pen bits (a convertible in tablet mode has a touch
// screen and, if none is plugged in, no mouse).

const SM_MOUSEPRESENT = 19;
const SM_DIGITIZER = 94;
const NID_INTEGRATED_TOUCH = 0x1;
const NID_EXTERNAL_TOUCH = 0x2;
const NID_INTEGRATED_PEN = 0x4;
const NID_EXTERNAL_PEN = 0x8;
const NID_READY = 0x80;
const POLL_MILLISECONDS = 2000;

/** Whether the mask has any of the bits. */
function hasBits({ mask, bits }: {
  mask: number;
  bits: number;
}) {
  return (mask & bits) !== 0;
}

/**
 * The pointing devices present now: a mouse, a ready touch digitizer and a
 * pen digitizer. A machine where the call fails is taken to have a mouse.
 *
 * @returns The devices.
 */
export function readPointerDevices() {
  try {
    const digitizer = systemMetric(SM_DIGITIZER);
    const isReady = hasBits({
      mask: digitizer,
      bits: NID_READY
    });
    return {
      hasMouse: systemMetric(SM_MOUSEPRESENT) !== 0,
      hasTouch: isReady && hasBits({
        mask: digitizer,
        bits: NID_INTEGRATED_TOUCH | NID_EXTERNAL_TOUCH
      }),
      hasPen: isReady && hasBits({
        mask: digitizer,
        bits: NID_INTEGRATED_PEN | NID_EXTERNAL_PEN
      })
    } satisfies MediaDevices;
  } catch {
    return {
      hasMouse: true,
      hasTouch: false,
      hasPen: false
    } satisfies MediaDevices;
  }
}

/**
 * Calls back when the devices present change (a mouse plugged in, a keyboard
 * dock, tablet mode), found by asking again every two seconds while anyone
 * listens: Windows tells a window of these only through messages it does not
 * own.
 *
 * @param callback - Called on the UI thread after a change.
 * @returns The way to stop.
 */
export function watchPointerDevices(callback: () => void) {
  let last = JSON.stringify(readPointerDevices());
  return startTimer({
    milliseconds: POLL_MILLISECONDS,
    onTick() {
      const now = JSON.stringify(readPointerDevices());
      const isChanged = now !== last;
      if (isChanged) {
        last = now;
        callback();
      }
    }
  });
}
