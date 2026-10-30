import {
  CHECK_ADAPTER,
  COLOR_ADAPTER,
  DATE_ADAPTER,
  NUMBER_ADAPTER,
  RATING_ADAPTER,
  selectionAdapter,
  TEXT_ADAPTER,
  TIME_ADAPTER
} from "./field-adapters.ts";
import assert from "node:assert/strict";
import { test } from "node:test";

// Each adapter reads the member its control keeps the value in, hears the
// event that changes it, and puts the value back.

function event() {
  const listeners = new Set<() => void>();
  return {
    add(listener: () => void) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    fire() {
      for (const listener of listeners) {
        listener();
      }
    },
    count: () => listeners.size
  };
}

test("text: reads, hears a change, restores, and stops listening", () => {
  const changed = event();
  const box = {
    text: "start",
    onTextChanged: changed.add
  };
  const restore = TEXT_ADAPTER.capture(box);
  let heard = 0;
  const stop = TEXT_ADAPTER.subscribe({
    control: box,
    listener: () => heard++
  });
  box.text = "typed";
  changed.fire();
  assert.equal(TEXT_ADAPTER.read(box), "typed");
  assert.equal(heard, 1);
  restore();
  assert.equal(box.text, "start");
  stop();
  assert.equal(changed.count(), 0);
});

test("number: an empty NumberBox (NaN) is null", () => {
  const box = {
    value: Number.NaN,
    onValueChanged: event().add
  };
  assert.equal(NUMBER_ADAPTER.read(box), null);
  box.value = 4;
  assert.equal(NUMBER_ADAPTER.read(box), 4);
});

test("rating: -1 is no rating", () => {
  const rating = {
    value: -1,
    onValueChanged: event().add
  };
  assert.equal(RATING_ADAPTER.read(rating), null);
});

test("check: only a true isChecked counts, and all three events are heard", () => {
  const checked = event();
  const unchecked = event();
  const indeterminate = event();
  const box: Parameters<typeof CHECK_ADAPTER.read>[0] = {
    isChecked: null,
    onChecked: checked.add,
    onUnchecked: unchecked.add,
    onIndeterminate: indeterminate.add
  };
  assert.equal(CHECK_ADAPTER.read(box), false);
  box.isChecked = true;
  assert.equal(CHECK_ADAPTER.read(box), true);
  let heard = 0;
  const stop = CHECK_ADAPTER.subscribe({
    control: box,
    listener: () => heard++
  });
  checked.fire();
  unchecked.fire();
  indeterminate.fire();
  assert.equal(heard, 3);
  stop();
  assert.equal(checked.count() + unchecked.count() + indeterminate.count(), 0);
});

test("selection: the item's value, null for no selection, and the index restored", () => {
  const adapter = selectionAdapter();
  const box: Parameters<typeof adapter.read>[0] = {
    selectedIndex: 1,
    selectedItem: {
      content: "Pro"
    },
    onSelectionChanged: event().add
  };
  assert.equal(adapter.read(box), "Pro");
  const restore = adapter.capture(box);
  box.selectedIndex = -1;
  box.selectedItem = null;
  assert.equal(adapter.read(box), null);
  restore();
  assert.equal(box.selectedIndex, 1);
  const upper = selectionAdapter(item => String(item).toUpperCase());
  assert.equal(
    upper.read({
      selectedIndex: 0,
      selectedItem: "free",
      onSelectionChanged: event().add
    }), "FREE"
  );
});

test("date, time and color read in HTML's forms", () => {
  const ticksFrom1601To1970 = 116_444_736_000_000_000n;
  assert.deepEqual(
    DATE_ADAPTER.read({
      date: {
        universalTime: ticksFrom1601To1970
      },
      onDateChanged: event().add
    }), new Date(0)
  );
  assert.equal(
    DATE_ADAPTER.read({
      date: null,
      onDateChanged: event().add
    }), null
  );
  const ticksPerMinute = 600_000_000n;
  assert.equal(
    TIME_ADAPTER.read({
      time: {
        duration: 545n * ticksPerMinute
      },
      onTimeChanged: event().add
    }), "09:05"
  );
  assert.equal(
    COLOR_ADAPTER.read({
      color: {
        r: 255,
        g: 0,
        b: 16
      },
      onColorChanged: event().add
    }), "#ff0010"
  );
});
