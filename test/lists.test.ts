import { ExampleProcess, IS_WINDOWS_APP_SDK_RESTORED, numberOf } from "./example-process.ts";
import assert from "node:assert/strict";
import { test } from "node:test";

// The lists example (examples/lists) in a real WinUI window, off screen and
// never activated: a ListView of 1000 rows, each a Svelte component. Skipped
// where the Windows App SDK was not restored.

const TIMEOUT_MILLISECONDS = 300_000;
const ROW_COUNT = 1000;
// A 640 pixel window shows 16 rows; the list also realizes a few pages beyond
// its edges (ItemsStackPanel.CacheLength), about 76 in all.
const MOST_CONTAINERS = 150;

test("a list of 1000 rows keeps a screenful of rows, recycles them and ends none twice", {
  skip: !IS_WINDOWS_APP_SDK_RESTORED,
  timeout: TIMEOUT_MILLISECONDS
}, async () => {
  const example = ExampleProcess.start({ entry: "examples/lists/main.ts" });
  try {
    const opened = await example.settled({
      command: {
        cmd: "stats"
      },
      kind: "stats"
    });
    assert.equal(
      numberOf({
        report: opened,
        field: "rows"
      }), ROW_COUNT
    );
    const shown = numberOf({
      report: opened,
      field: "live"
    });
    assert.ok(shown > 5 && shown < MOST_CONTAINERS, `${shown} rows shown of ${ROW_COUNT}`);
    assert.equal(
      numberOf({
        report: opened,
        field: "destroyed"
      }), 0
    );

    const scrolled = await example.settled({
      command: {
        cmd: "scroll",
        key: "row-900"
      },
      kind: "scrolled"
    });
    const afterScroll = numberOf({
      report: scrolled,
      field: "live"
    });
    assert.ok(afterScroll < MOST_CONTAINERS, `${afterScroll} rows alive after scrolling to the end`);
    assert.ok(
      numberOf({
        report: scrolled,
        field: "destroyed"
      }) > 0, "no row was ended by the scroll"
    );
    assert.equal(
      numberOf({
        report: scrolled,
        field: "created"
      }) - numberOf({
        report: scrolled,
        field: "destroyed"
      }), afterScroll
    );

    const back = await example.settled({
      command: {
        cmd: "scroll",
        key: "row-0"
      },
      kind: "scrolled"
    });
    assert.ok(
      numberOf({
        report: back,
        field: "live"
      }) < MOST_CONTAINERS, "rows piled up scrolling back"
    );

    // A rename reaches the row that shows it without making a new one.
    const before = await example.ask({
      command: {
        cmd: "stats"
      },
      kind: "stats"
    });
    const renamed = await example.settled({
      command: {
        cmd: "rename",
        key: "row-0",
        name: "Renamed"
      },
      kind: "renamed"
    });
    assert.equal(
      numberOf({
        report: renamed,
        field: "created"
      }), numberOf({
        report: before,
        field: "created"
      })
    );
    assert.equal(
      numberOf({
        report: renamed,
        field: "destroyed"
      }), numberOf({
        report: before,
        field: "destroyed"
      })
    );

    // Alt+Down on the third row: the keyboard path, invoked through the list's handle.
    const moved = await example.settled({
      command: {
        cmd: "move",
        key: "row-2",
        direction: "down"
      },
      kind: "moved"
    });
    assert.deepEqual(moved["first"], ["row-0", "row-1", "row-3", "row-2", "row-4"]);
    assert.equal(
      numberOf({
        report: moved,
        field: "reorders"
      }), 1
    );
    assert.equal(
      numberOf({
        report: moved,
        field: "rows"
      }), ROW_COUNT
    );

    // A row that goes takes its component with it.
    const removed = await example.settled({
      command: {
        cmd: "remove",
        key: "row-1"
      },
      kind: "removed"
    });
    assert.equal(
      numberOf({
        report: removed,
        field: "rows"
      }), ROW_COUNT - 1
    );
    assert.deepEqual(removed["first"], ["row-0", "row-3", "row-2", "row-4", "row-5"]);
    assert.ok(
      numberOf({
        report: removed,
        field: "live"
      }) < MOST_CONTAINERS
    );

    const cleared = await example.settled({
      command: {
        cmd: "clear"
      },
      kind: "cleared"
    });
    assert.equal(
      numberOf({
        report: cleared,
        field: "rows"
      }), 0
    );
    assert.equal(
      numberOf({
        report: cleared,
        field: "live"
      }), 0, "rows outlived their items"
    );

    example.send({ cmd: "close" });
    assert.equal(await example.exited, 0);
  } finally {
    example.kill();
  }
});

test("a grid view of 1000 items realizes only the ones it shows", {
  skip: !IS_WINDOWS_APP_SDK_RESTORED,
  timeout: TIMEOUT_MILLISECONDS
}, async () => {
  const example = ExampleProcess.start({
    entry: "examples/lists/main.ts",
    flags: ["--view", "grid"]
  });
  try {
    const opened = await example.settled({
      command: {
        cmd: "stats"
      },
      kind: "stats"
    });
    const shown = numberOf({
      report: opened,
      field: "live"
    });
    assert.ok(shown > 5 && shown < ROW_COUNT / 2, `${shown} items shown of ${ROW_COUNT}`);
    example.send({ cmd: "close" });
    assert.equal(await example.exited, 0);
  } finally {
    example.kill();
  }
});

test("a list's selected key and its selection follow each other, through moves and removals", {
  skip: !IS_WINDOWS_APP_SDK_RESTORED,
  timeout: TIMEOUT_MILLISECONDS
}, async () => {
  const example = ExampleProcess.start({
    entry: "examples/lists/main.ts",
    flags: ["--selection", "single"]
  });
  try {
    const none = await example.settled({
      command: {
        cmd: "stats"
      },
      kind: "stats"
    });
    assert.equal(none["selectedKey"], null);
    assert.deepEqual(none["controlSelected"], []);

    // The app sets the key: the control selects that item.
    const selected = await example.settled({
      command: {
        cmd: "select",
        key: "row-3"
      },
      kind: "selected"
    });
    assert.deepEqual(selected["controlSelected"], ["row-3"]);
    assert.equal(selected["selectedKey"], "row-3");

    // The items reorder (the control removes and inserts the item): the same item stays selected.
    const moved = await example.settled({
      command: {
        cmd: "move",
        key: "row-3",
        direction: "down"
      },
      kind: "moved"
    });
    assert.deepEqual(moved["first"], ["row-0", "row-1", "row-2", "row-4", "row-3"]);
    assert.deepEqual(moved["controlSelected"], ["row-3"]);
    assert.equal(moved["selectedKey"], "row-3");

    // The user picks an item: the key follows.
    const picked = await example.settled({
      command: {
        cmd: "pick",
        index: 1
      },
      kind: "picked"
    });
    assert.deepEqual(picked["controlSelected"], ["row-1"]);
    assert.equal(picked["selectedKey"], "row-1");

    // The selected item goes: nothing is selected, and the key is cleared.
    const removed = await example.settled({
      command: {
        cmd: "remove",
        key: "row-1"
      },
      kind: "removed"
    });
    assert.deepEqual(removed["controlSelected"], []);
    assert.equal(removed["selectedKey"], null);

    // No key clears the selection.
    await example.settled({
      command: {
        cmd: "select",
        key: "row-2"
      },
      kind: "selected"
    });
    const cleared = await example.settled({
      command: {
        cmd: "select",
        key: null
      },
      kind: "selected"
    });
    assert.deepEqual(cleared["controlSelected"], []);
    assert.equal(cleared["selectedKey"], null);

    example.send({ cmd: "close" });
    assert.equal(await example.exited, 0);
  } finally {
    example.kill();
  }
});
