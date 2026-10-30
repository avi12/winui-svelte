import { ExampleProcess, IS_WINDOWS_APP_SDK_RESTORED } from "./example-process.ts";
import type { Report } from "./example-process.ts";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { test } from "node:test";

// The media example (examples/media) in a real WinUI window, off screen and
// never activated, on a FAKE settings file (WINUI_SVELTE_FAKE_SETTINGS): the
// test rewrites the file and the window's @media rules, light-dark(),
// mediaQuery, matchMedia, Svelte's MediaQuery and its reduced-motion
// transitions flip live. Windows' own settings are never touched and no input
// is injected. Skipped where the Windows App SDK was not restored.

const TIMEOUT_MILLISECONDS = 300_000;
const WAIT_MILLISECONDS = 15_000;
const POLL_MILLISECONDS = 250;
const ELEMENT_THEME_DARK = 2;
const ELEMENT_THEME_LIGHT = 1;
const DARK_WIDTH = 111;
const CONTRAST_HEIGHT = 77;
const TRANSPARENCY_MIN_WIDTH = 55;
const LARGE_TEXT = 1.5;

async function stats(example: ExampleProcess) {
  return example.ask({
    command: {
      cmd: "stats"
    },
    kind: "stats"
  });
}

// Asks until the report satisfies the check, or the wait runs out.
async function until({ example, check, what }: {
  example: ExampleProcess;
  check(report: Report): boolean;
  what: string;
}) {
  const deadline = Date.now() + WAIT_MILLISECONDS;
  let report = await stats(example);
  while (!check(report) && Date.now() < deadline) {
    await new Promise(resolve => setTimeout(resolve, POLL_MILLISECONDS));
    report = await stats(example);
  }

  assert.ok(check(report), `${what}: ${JSON.stringify(report)}`);
  return report;
}

test("the window follows the settings file live: @media, light-dark, mediaQuery, matchMedia, theme and reduced motion", {
  skip: !IS_WINDOWS_APP_SDK_RESTORED,
  timeout: TIMEOUT_MILLISECONDS
}, async () => {
  const directory = mkdtempSync(path.join(tmpdir(), "winui-media-test-"));
  const file = path.join(directory, "settings.json");
  function settings(values: object) {
    writeFileSync(file, JSON.stringify(values));
  }
  settings({});
  const example = ExampleProcess.start({
    entry: "examples/media/main.ts",
    env: {
      WINUI_SVELTE_FAKE_SETTINGS: file
    }
  });
  try {
    const light = await until({
      example,
      what: "the window starts light",
      check: report => report["theme"] === ELEMENT_THEME_LIGHT && report["hasTransition"] === true
    });
    assert.equal(light["isDark"], false);
    assert.equal(light["listDark"], false);
    assert.equal(light["svelteDark"], false);
    assert.equal(light["width"], null, "the dark rule does not apply");
    assert.equal(light["red"], 255, "light-dark() is the light value");
    assert.equal(light["cardRed"], 255);

    settings({ isDark: true });
    const dark = await until({
      example,
      what: "dark mode reaches every reader",
      check: report => report["isDark"] === true && report["theme"] === ELEMENT_THEME_DARK && report["width"] === DARK_WIDTH && report["cardRed"] === 0
    });
    assert.equal(dark["listDark"], true, "matchMedia answers");
    assert.equal(dark["svelteDark"], true, "Svelte's MediaQuery reads the installed matchMedia");
    assert.ok(Number(dark["changes"]) >= 1, "the MediaQueryList raised a change event");
    assert.equal(dark["red"], 0, "light-dark() is the dark value, re-read on the theme change");

    settings({
      isDark: true,
      isAnimationEnabled: false
    });
    const reduced = await until({
      example,
      what: "reduced motion removes the implicit transition",
      check: report => report["isReduced"] === true && report["hasTransition"] === false
    });
    assert.equal(reduced["width"], DARK_WIDTH, "the other rules still apply");

    settings({
      isDark: true,
      isHighContrast: true,
      isTransparencyEnabled: false,
      textScaleFactor: LARGE_TEXT
    });
    const contrast = await until({
      example,
      what: "forced colors, contrast, transparency and text scale apply",
      check: report => report["isMore"] === true && report["height"] === CONTRAST_HEIGHT
    });
    assert.equal(contrast["minWidth"], TRANSPARENCY_MIN_WIDTH, "reduced transparency applies");
    assert.equal(contrast["textScaleFactor"], LARGE_TEXT);
    assert.equal(contrast["hasTransition"], true, "animations are back on");

    settings({});
    await until({
      example,
      what: "everything flips back",
      check: report => report["isDark"] === false && report["theme"] === ELEMENT_THEME_LIGHT && report["width"] === null && report["height"] === null && report["minWidth"] === 0
    });
    example.send({ cmd: "close" });
    assert.equal(await example.exited, 0);
  } finally {
    example.kill();
    rmSync(directory, {
      recursive: true,
      force: true
    });
  }
});
