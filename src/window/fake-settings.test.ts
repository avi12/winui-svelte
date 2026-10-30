import assert from "node:assert/strict";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { test } from "node:test";

// The settings a test drives through a JSON file: each field optional, typed,
// and read live, so rewriting the file changes the answer.

const { fakeSettingsSource } = await import("./fake-settings.ts");
const FOREGROUND = 1;
const SCALE_150 = 1.5;

function withFile(run: (file: string) => void) {
  const directory = mkdtempSync(path.join(tmpdir(), "winui-fake-settings-"));
  try {
    run(path.join(directory, "settings.json"));
  } finally {
    rmSync(directory, {
      recursive: true,
      force: true
    });
  }
}

test("the file's fields are read live, and the rest are Windows' defaults", () => {
  withFile(file => {
    writeFileSync(file, "{}");
    const source = fakeSettingsSource(file);
    assert.equal(source.highContrast, false);
    assert.equal(source.animationsEnabled, true);
    assert.equal(source.advancedEffectsEnabled, true);
    assert.equal(source.textScaleFactor, 1);
    assert.equal(source.getColorValue(FOREGROUND).r, 0, "light theme: a dark foreground");

    writeFileSync(
      file, JSON.stringify({
        isDark: true,
        isHighContrast: true,
        isAnimationEnabled: false,
        isTransparencyEnabled: false,
        textScaleFactor: SCALE_150
      })
    );
    assert.equal(source.highContrast, true);
    assert.equal(source.animationsEnabled, false);
    assert.equal(source.advancedEffectsEnabled, false);
    assert.equal(source.textScaleFactor, SCALE_150);
    assert.equal(source.getColorValue(FOREGROUND).r, 255, "dark theme: a light foreground");
  });
});

test("a field of the wrong type is refused by name", () => {
  withFile(file => {
    writeFileSync(file, JSON.stringify({ isDark: "yes" }));
    assert.throws(() => fakeSettingsSource(file).getColorValue(FOREGROUND), /"isDark" must be a boolean/u);
  });
});
