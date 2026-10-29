import { ExampleProcess, IS_WINDOWS_APP_SDK_RESTORED, numberOf } from "./example-process.ts";
import type { Report } from "./example-process.ts";
import assert from "node:assert/strict";
import { test } from "node:test";

// The navigation example (examples/navigation) in a real WinUI window, off
// screen and never activated: a Navigator shows a page per item of a
// NavigationView, keeps a history the back button walks, keeps the pages
// whose cache mode says so and ends the others. Skipped where the Windows App
// SDK was not restored.

const TIMEOUT_MILLISECONDS = 300_000;
const BUMPS = 2;

function pageOf(report: Report) {
  return report["page"];
}

test("pages follow the history, the cache keeps what it says and the menu follows both", {
  skip: !IS_WINDOWS_APP_SDK_RESTORED,
  timeout: TIMEOUT_MILLISECONDS
}, async () => {
  const example = ExampleProcess.start({ entry: "examples/navigation/main.ts" });
  try {
    const opened = await example.settled({
      command: {
        cmd: "stats"
      },
      kind: "stats"
    });
    assert.equal(pageOf(opened), "home");
    assert.equal(opened["canGoBack"], false);
    assert.equal(opened["selected"], "home", "the menu shows the first page selected");
    assert.equal(
      numberOf({
        report: opened,
        field: "homeCreated"
      }), 1
    );

    const counter = await example.settled({
      command: {
        cmd: "navigate",
        to: "counter"
      },
      kind: "navigated"
    });
    assert.equal(pageOf(counter), "counter");
    assert.equal(counter["canGoBack"], true);
    assert.equal(counter["selected"], "counter", "the menu follows a navigation made in code");
    assert.equal(
      numberOf({
        report: counter,
        field: "homeDestroyed"
      }), 1, "home is not cached, so it ended when it was left"
    );

    for (let i = 0; i < BUMPS; i++) {
      await example.ask({
        command: {
          cmd: "bump"
        },
        kind: "bumped"
      });
    }

    const about = await example.settled({
      command: {
        cmd: "navigate",
        to: "about"
      },
      kind: "navigated"
    });
    assert.equal(pageOf(about), "about");
    assert.equal(
      numberOf({
        report: about,
        field: "counterDestroyed"
      }), 0, "the counter page is required, so it stays mounted"
    );

    const back = await example.settled({
      command: {
        cmd: "back"
      },
      kind: "navigated"
    });
    assert.equal(pageOf(back), "counter");
    assert.equal(back["selected"], "counter", "the menu follows the back button");
    assert.equal(back["canGoForward"], true);
    assert.equal(
      numberOf({
        report: back,
        field: "counterValue"
      }), BUMPS, "the page kept its state"
    );
    assert.equal(
      numberOf({
        report: back,
        field: "counterCreated"
      }), 1, "and was not made again"
    );
    assert.equal(
      numberOf({
        report: back,
        field: "aboutDestroyed"
      }), 1, "about is not cached, so it ended when it was left"
    );

    const home = await example.settled({
      command: {
        cmd: "back"
      },
      kind: "navigated"
    });
    assert.equal(pageOf(home), "home");
    assert.equal(home["canGoBack"], false);
    assert.equal(
      numberOf({
        report: home,
        field: "homeCreated"
      }), 2, "an uncached page is made again when the history returns to it"
    );

    const forward = await example.settled({
      command: {
        cmd: "forward"
      },
      kind: "navigated"
    });
    assert.equal(pageOf(forward), "counter");

    const chosen = await example.settled({
      command: {
        cmd: "select",
        to: "about"
      },
      kind: "selected"
    });
    assert.equal(pageOf(chosen), "about", "choosing a menu item navigates to its page");
    assert.equal(chosen["canGoBack"], true);
    assert.equal(chosen["canGoForward"], false, "a new page drops the pages that were forward");

    example.send({ cmd: "close" });
    assert.equal(await example.exited, 0);
  } finally {
    example.kill();
  }
});
