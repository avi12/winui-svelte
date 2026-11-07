import { ExampleProcess, IS_WINDOWS_APP_SDK_RESTORED } from "./example-process.ts";
import assert from "node:assert/strict";
import { test } from "node:test";

// The tray menu model drawn as a MenuFlyout (examples/tray-menu) in a real
// WinUI window, off screen and never activated. The docs say nothing of a
// nested MenuFlyoutSubItem, radio groups or toggle items in a flyout opened
// from a one-pixel tray window, so this opens the menu with
// shouldActivateMenu={false} at a point and reads the flyout's items back
// through the API; it is closed through the API too. It sends no input.

const TIMEOUT_MILLISECONDS = 300_000;
const WAIT_MILLISECONDS = 20_000;
const POLL_MILLISECONDS = 300;
const MENU_POINT = {
  x: 400,
  y: 300
};

async function untilFlyoutHas({ example, count }: {
  example: ExampleProcess;
  count: number;
}) {
  const deadline = Date.now() + WAIT_MILLISECONDS;
  for (;;) {
    const report = await example.ask({
      command: {
        cmd: "info"
      },
      kind: "info"
    });
    const flyout = report["flyout"];
    const isMet = Array.isArray(flyout) && flyout.length === count;
    const isLate = Date.now() > deadline;
    const isDone = isMet || isLate;
    if (isDone) {
      return report;
    }

    await new Promise(resolve => setTimeout(resolve, POLL_MILLISECONDS));
  }
}

test("the model is drawn as WinUI menu items, nested and grouped, and the markup elements live in the window", {
  skip: !IS_WINDOWS_APP_SDK_RESTORED,
  timeout: TIMEOUT_MILLISECONDS
}, async () => {
  const example = ExampleProcess.start({ entry: "examples/tray-menu/main.ts" });
  try {
    const started = await example.ask({
      command: {
        cmd: "info"
      },
      kind: "info"
    });
    assert.equal(started["kind"], "info", "the window opened with inert menu elements inside it");

    await example.ask({
      command: {
        cmd: "open",
        ...MENU_POINT
      },
      kind: "open"
    });
    const shown = await untilFlyoutHas({
      example,
      count: 8
    });
    assert.deepEqual(shown["flyout"], [
      {
        type: "command",
        text: "Recorder",
        isEnabled: false,
        trailing: "",
        hasIcon: false
      },
      {
        type: "command",
        text: "Open",
        isEnabled: true,
        trailing: "3   Ctrl+O",
        hasIcon: true
      },
      {
        type: "toggle",
        text: "Start with Windows",
        isChecked: true,
        trailing: ""
      },
      { type: "separator" },
      {
        type: "radio",
        text: "Fast",
        group: "speed",
        isChecked: true,
        trailing: ""
      },
      {
        type: "radio",
        text: "Slow",
        group: "speed",
        isChecked: false,
        trailing: ""
      },
      {
        type: "submenu",
        text: "Capture",
        items: [
          {
            type: "command",
            text: "Region",
            isEnabled: true,
            trailing: "",
            hasIcon: false
          },
          {
            type: "submenu",
            text: "More",
            items: [{
              type: "command",
              text: "Scrolling",
              isEnabled: false,
              trailing: "",
              hasIcon: false
            }]
          }
        ]
      },
      {
        type: "command",
        text: "Quit",
        isEnabled: true,
        trailing: "",
        hasIcon: false
      }
    ], "the level hides the full-only line, the required Quit stays");
    await example.ask({
      command: {
        cmd: "menuClose"
      },
      kind: "menuClose"
    });
    const markup = await example.ask({
      command: {
        cmd: "markupOpen",
        ...MENU_POINT
      },
      kind: "markupOpen"
    });
    assert.equal(markup["isMarkupMenuOpen"], true, "a menu written as markup opens too");
    await example.ask({
      command: {
        cmd: "menuClose"
      },
      kind: "menuClose"
    });
    assert.equal(await example.stop(), true, "the example left through its own close");
  } finally {
    await example.stop();
  }
});
