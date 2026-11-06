import { ExampleProcess, IS_WINDOWS_APP_SDK_RESTORED, numberOf } from "./example-process.ts";
import { windowPixels } from "./window-pixels.ts";
import assert from "node:assert/strict";
import { test } from "node:test";

// The view transitions example (examples/view-transitions) in a real WinUI
// window, off screen and never activated, driven by commands (no input is
// sent). Opening a photo runs `document.startViewTransition`: its thumbnail
// and the detail page's hero share a view-transition-name, so WinUI's
// connected animation flies one to the other. `finished` waits for WinUI's
// Completed event, and with no animation started it follows `ready` at once,
// so the time between them shows what flew: opening uses WinUI's default
// (gravity) configuration at the 800 milliseconds the example sets, going
// back asks for `direct`, which keeps a short duration of its own (measured:
// about 230 milliseconds) whatever the default. Then the hero is read from the
// pixels: shown on the detail page, gone from the list.

const TIMEOUT_MILLISECONDS = 300_000;
const ORIGIN_COLOR = "336699";
const LAYOUT_MILLISECONDS = 1500;
const NO_FLIGHT_MILLISECONDS = 100;
const DEFAULT_FLIGHT_MILLISECONDS = 600;
const HERO_X = 180;
const HERO_Y = 120;
const GLACIER = 3;

const STEPS = [
  {
    command: {
      cmd: "open",
      id: GLACIER
    },
    isFlightAtDefault: true,
    isHeroShown: true
  },
  {
    command: {
      cmd: "back"
    },
    isFlightAtDefault: false,
    isHeroShown: false
  }
];

function wait(milliseconds: number) {
  return new Promise(resolve => setTimeout(resolve, milliseconds));
}

test("opening a photo flies its thumbnail to the detail page's hero, and back", {
  skip: !IS_WINDOWS_APP_SDK_RESTORED,
  timeout: TIMEOUT_MILLISECONDS
}, async () => {
  const example = ExampleProcess.start({ entry: "examples/view-transitions/main.ts" });
  try {
    const scale = numberOf({
      report: await example.ask({
        command: {
          cmd: "stats"
        },
        kind: "stats"
      }),
      field: "scale"
    });
    await wait(LAYOUT_MILLISECONDS);
    for (const { command, isFlightAtDefault, isHeroShown } of STEPS) {
      const report = await example.ask({
        command,
        kind: "transitioned"
      });
      assert.equal(report["isReady"], true, `${command.cmd}: the transition is ready`);
      const flight = numberOf({
        report,
        field: "flightMilliseconds"
      });
      assert.ok(flight >= NO_FLIGHT_MILLISECONDS, `${command.cmd}: a connected animation ran (${flight} ms)`);
      assert.equal(
        flight >= DEFAULT_FLIGHT_MILLISECONDS,
        isFlightAtDefault,
        `${command.cmd}: the flight took ${flight} ms`
      );
      const [hero] = windowPixels({
        pid: example.pid,
        scale,
        origin: ORIGIN_COLOR,
        points: [{
          x: HERO_X,
          y: HERO_Y
        }]
      });
      const isBlue = hero?.b === 0xff && hero.r === 0 && hero.g === 0;
      assert.equal(isBlue, isHeroShown, `${command.cmd}: the hero's pixel is ${JSON.stringify(hero)}`);
    }
  } finally {
    await example.stop();
  }
});
