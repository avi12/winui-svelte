import "#src/state/test-support/svelte-runes.js";
import assert from "node:assert/strict";
import { test } from "node:test";

// The settings reader on a stand-in for UISettings: values are read live, a
// native event reaches the effects reading them, and an effect that ends
// unsubscribes.

const { flushSync, tick } = await import("svelte");
const { observeSettings } = await import("./system-settings.svelte.ts");
const { track } = await import("#src/state/test-support/track.svelte.js");

const ACCENT = 5;
const TEXT_SCALE_150_PERCENT = 1.5;

class FakeSettings {
  accent = {
    a: 255,
    r: 0,
    g: 120,
    b: 212
  };

  textScaleFactor = 1;

  get animationsEnabled() {
    return this.isAnimationOn;
  }
  isAnimationOn = true;
  isHighContrastOn = false;
  private readonly listeners: Array<() => void> = [];

  get listenerCount() {
    return this.listeners.length;
  }

  get highContrast() {
    return this.isHighContrastOn;
  }

  onHighContrastChanged(callback: () => void) {
    return this.listen(callback);
  }

  getColorValue(color: number) {
    assert.equal(color, ACCENT, "only the accent is asked for");
    return this.accent;
  }

  onColorValuesChanged(callback: () => void) {
    return this.listen(callback);
  }

  onTextScaleFactorChanged(callback: () => void) {
    return this.listen(callback);
  }

  onAnimationsEnabledChanged(callback: () => void) {
    return this.listen(callback);
  }

  // One change is one event: the first subscription stands for whichever
  // setting changed.
  raise() {
    this.listeners[0]?.();
  }

  private listen(callback: () => void) {
    this.listeners.push(callback);
    return () => {
      this.listeners.splice(this.listeners.indexOf(callback), 1);
    };
  }
}

function settingsOver(source: FakeSettings) {
  return observeSettings({
    source,
    runOnUiThread(work) {
      work();
      flushSync();
    }
  });
}

test("the accent color is read as text a color prop takes, with alpha only when it is not opaque", () => {
  const source = new FakeSettings();
  const settings = settingsOver(source);
  assert.equal(settings.accentColor, "#0078d4");
  source.accent = {
    a: 128,
    r: 1,
    g: 2,
    b: 3
  };
  assert.equal(settings.accentColor, "#80010203");
  assert.equal(source.listenerCount, 0, "reading outside an effect subscribes to nothing");
});

test("a change in the settings reaches the effects that read them, and an ended effect unsubscribes", async () => {
  const source = new FakeSettings();
  const settings = settingsOver(source);
  const accent = track(() => settings.accentColor);
  const scale = track(() => settings.textScaleFactor);
  const animation = track(() => settings.isAnimationEnabled);
  const contrast = track(() => settings.isHighContrast);
  assert.equal(source.listenerCount, 4, "one subscription per event, shared by every effect");

  source.accent = {
    a: 255,
    r: 255,
    g: 0,
    b: 0
  };
  source.textScaleFactor = TEXT_SCALE_150_PERCENT;
  source.isAnimationOn = false;
  source.isHighContrastOn = true;
  source.raise();
  assert.deepEqual(accent.values, ["#0078d4", "#ff0000"]);
  assert.deepEqual(scale.values, [1, TEXT_SCALE_150_PERCENT]);
  assert.deepEqual(animation.values, [true, false]);
  assert.deepEqual(contrast.values, [false, true]);

  accent.stop();
  scale.stop();
  animation.stop();
  contrast.stop();
  // Svelte lets go of the source one tick after the last reader has gone.
  await tick();
  assert.equal(source.listenerCount, 0);
});
