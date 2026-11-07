import type { PickableItem } from "./flyout-model.ts";

/**
 * The part of a flyout that decides what a pick does. WinUI closes a flyout
 * when an item is invoked and has no way to keep it open, so a `staysOpen`
 * item is followed by a fresh flyout, built from the menu as it is now.
 *
 * `pick` is called by the item's click, `settle` by the flyout's close. An
 * item runs after the close (the model's `closeThenRun`, which lets a dialog
 * open) unless it says otherwise; a close with no pick is a dismissal.
 *
 * @param options - `close` ends the menu, `refresh` builds the flyout again, `defer` runs a function on the next turn.
 * @returns The two calls.
 */
export function createPicker({ close, refresh, defer }: {
  readonly close: () => void;
  readonly refresh: () => void;
  readonly defer: (run: () => void) => void;
}) {
  let picked: PickableItem | null = null;
  return {
    /** Remembers the picked item; one that does not wait for the close runs now. */
    pick(item: PickableItem) {
      picked = item;

      if (!item.closeThenRun) {
        item.select();
      }
    },
    /** The flyout has closed: runs, ends or renews, by what was picked. */
    settle() {
      const item = picked;
      picked = null;
      const isDismissed = item === null;
      if (isDismissed) {
        close();
        return;
      }

      if (item.staysOpen) {
        if (item.closeThenRun) {
          item.select();
        }

        refresh();
        return;
      }

      close();

      if (item.closeThenRun) {
        defer(() => item.select());
      }
    }
  };
}
