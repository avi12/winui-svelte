import { createSettingsStore } from "./settings-store.ts";
import type { SettingsSource } from "./settings-store.ts";
import { onTeardown, runTeardown } from "./teardown.ts";
import assert from "node:assert/strict";
import { test } from "node:test";

// What outlives the application is undone first, once, latest first.

test("teardown runs each callback once, the latest first, and skips a withdrawn one", () => {
  const order: string[] = [];
  onTeardown(() => order.push("first"));
  onTeardown(() => order.push("second"));
  const withdraw = onTeardown(() => order.push("withdrawn"));
  withdraw();
  runTeardown();
  runTeardown();
  assert.deepEqual(order, ["second", "first"]);
});

test("a callback that throws does not stop the others", () => {
  const order: string[] = [];
  onTeardown(() => order.push("last"));
  onTeardown(() => {
    throw new Error("expected in this test");
  });
  const original = console.error;
  console.error = () => undefined;
  try {
    runTeardown();
  } finally {
    console.error = original;
  }

  assert.deepEqual(order, ["last"]);
});

test("the settings store lets go of the system's events when the application ends", () => {
  let stopped = 0;
  function listen() {
    return () => {
      stopped++;
    };
  }

  const source: SettingsSource = {
    textScaleFactor: 1,
    animationsEnabled: true,
    advancedEffectsEnabled: true,
    highContrast: false,
    getColorValue: () => ({
      a: 255,
      r: 0,
      g: 0,
      b: 0
    }),
    onColorValuesChanged: listen,
    onTextScaleFactorChanged: listen,
    onAnimationsEnabledChanged: listen,
    onAdvancedEffectsEnabledChanged: listen,
    onHighContrastChanged: listen
  };
  const store = createSettingsStore({
    source,
    runOnUiThread: work => work()
  });
  const unsubscribe = store.subscribe(() => undefined);
  runTeardown();
  assert.equal(stopped, 5);
  unsubscribe();
  assert.equal(stopped, 5, "a handler was removed twice");
});
