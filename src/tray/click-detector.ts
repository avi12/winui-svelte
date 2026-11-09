import type { ButtonSample, PointerSample, ScreenRect } from "./native.ts";
import type { PointerButton } from "#src/win32-key-state.js";

/** The gestures on a tray icon. */
export const TrayGesture = {
  click: "click",
  doubleClick: "doubleClick",
  contextMenu: "contextMenu",
  middleClick: "middleClick"
} as const;
/** One of `TrayGesture`'s values. */
export type TrayGesture = typeof TrayGesture[keyof typeof TrayGesture];

/** A gesture and where the pointer was, in screen pixels. */
export interface TrayPointerEvent {
  readonly gesture: TrayGesture;
  readonly x: number;
  readonly y: number;
}

const BUTTONS: readonly PointerButton[] = ["left", "right", "middle"];
const NOT_PRESSED = -1;
const GESTURE_OF_BUTTON = {
  right: TrayGesture.contextMenu,
  middle: TrayGesture.middleClick
} as const;

function isInside({ rect, x, y }: {
  rect: ScreenRect | null;
  x: number;
  y: number;
}) {
  const isUnknown = rect === null;
  if (isUnknown) {
    return false;
  }

  const isHorizontal = x >= rect.left && x < rect.right;
  const isVertical = y >= rect.top && y < rect.bottom;
  return isHorizontal && isVertical;
}

/**
 * Turns polled pointer samples into tray gestures. A gesture is a press and a
 * release that both happen over the icon. `now` is the clock in milliseconds;
 * two left clicks closer than `doubleClickMilliseconds` are a double click.
 */
export function createClickDetector({ now, doubleClickMilliseconds, onGesture }: {
  now: () => number;
  doubleClickMilliseconds: number;
  onGesture: (event: TrayPointerEvent) => void;
}) {
  const wasDown = new Map<PointerButton, boolean>();
  const pressedOnIcon = new Map<PointerButton, boolean>();
  let lastClickAt = NOT_PRESSED;

  function release({ button, event }: {
    button: PointerButton;
    event: Omit<TrayPointerEvent, "gesture">;
  }) {
    const isLeft = button === "left";
    if (!isLeft) {
      onGesture({
        ...event,
        gesture: GESTURE_OF_BUTTON[button]
      });
      return;
    }

    const time = now();
    const isDouble = lastClickAt !== NOT_PRESSED && time - lastClickAt <= doubleClickMilliseconds;
    onGesture({
      ...event,
      gesture: TrayGesture.click
    });

    if (isDouble) {
      onGesture({
        ...event,
        gesture: TrayGesture.doubleClick
      });
    }

    lastClickAt = isDouble ? NOT_PRESSED : time;
  }

  function step({ button, sample, isOverIcon }: {
    button: PointerButton;
    sample: ButtonSample;
    isOverIcon: boolean;
  }) {
    const isHeldBefore = wasDown.get(button) === true;
    const isPressStart = (sample.isDown || sample.wasPressed) && !isHeldBefore;
    if (isPressStart) {
      pressedOnIcon.set(button, isOverIcon);
    }

    const isReleased = !sample.isDown && (isHeldBefore || sample.wasPressed);
    wasDown.set(button, sample.isDown);
    const isGesture = isReleased && isOverIcon && pressedOnIcon.get(button) === true;
    return isGesture;
  }

  return {
    /** Feeds one sample; `rect` is the icon's rectangle, null when unknown. */
    feed({ sample, rect }: {
      sample: PointerSample;
      rect: ScreenRect | null;
    }) {
      const isOverIcon = isInside({
        rect,
        x: sample.x,
        y: sample.y
      });
      for (const button of BUTTONS) {
        const isGesture = step({
          button,
          sample: sample[button],
          isOverIcon
        });
        if (isGesture) {
          release({
            button,
            event: {
              x: sample.x,
              y: sample.y
            }
          });
        }
      }
    }
  };
}
