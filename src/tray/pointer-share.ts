import type { ButtonSample, PointerSample } from "./native.ts";

type ButtonName = "left" | "right" | "middle";
type PendingPresses = Record<ButtonName, boolean>;

/**
 * Lets several readers poll a pointer whose "pressed since the last read" flag is cleared by the
 * first read that sees it (`GetAsyncKeyState` does that, for the whole process). Each reader is told
 * of a press that a read by another reader consumed, so that two tray icons in one process both
 * hear a click shorter than their polling interval.
 */
export function createPointerShare() {
  const readers = new Set<PendingPresses>();
  return {
    /**
     * Makes a reader over `read`, which gives the raw sample.
     *
     * @param read - The unshared read.
     * @returns The shared read, and `stop`, which leaves the share.
     */
    join(read: () => PointerSample) {
      const own: PendingPresses = {
        left: false,
        right: false,
        middle: false
      };
      readers.add(own);

      function shareButton({ button, sample }: {
        button: ButtonName;
        sample: PointerSample;
      }) {
        const { isDown, wasPressed: isPressedNow } = sample[button];
        for (const other of readers) {
          other[button] = other[button] || isPressedNow;
        }

        const told: ButtonSample = {
          isDown,
          wasPressed: own[button]
        };
        own[button] = false;
        return told;
      }

      return {
        read() {
          const sample = read();
          return {
            ...sample,
            left: shareButton({
              button: "left",
              sample
            }),
            right: shareButton({
              button: "right",
              sample
            }),
            middle: shareButton({
              button: "middle",
              sample
            })
          };
        },
        stop() {
          readers.delete(own);
        }
      };
    }
  };
}
