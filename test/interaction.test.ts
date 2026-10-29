import { ExampleProcess, IS_WINDOWS_APP_SDK_RESTORED } from "./example-process.ts";
import type { Report } from "./example-process.ts";
import { act, exists, names, read } from "./uia.ts";
import assert from "node:assert/strict";
import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { after, before, describe, test } from "node:test";

// The interaction example (examples/interaction) in a real WinUI window, off
// screen: each Svelte feature that reaches a control (events, two-way
// bindings, blocks, directives, lifecycle) is driven the way a user or an
// assistive tool does, through UI Automation, and read back from the native
// control and from the component. Skipped where the Windows App SDK was not
// restored.

const TIMEOUT_MILLISECONDS = 300_000;
const SETTLE_MILLISECONDS = 400;
const HOT_MILLISECONDS = 30_000;
const VK_TAB = 9;
const VK_ENTER = 13;
const LIST_ITEM = /^\w\d$/u;
const GRID_CELL = /^\w@\d$/u;

describe("interaction", { skip: !IS_WINDOWS_APP_SDK_RESTORED }, () => {
  let example: ExampleProcess;

  async function stats() {
    return example.ask({
      command: {
        cmd: "stats"
      },
      kind: "stats"
    });
  }

  // Svelte applies a change in a flush of its own on the UI thread: give it
  // a moment, then read.
  async function set({ name, value }: {
    name: string;
    value: string | number | boolean;
  }) {
    await example.ask({
      command: {
        cmd: "set",
        name,
        value
      },
      kind: "stats"
    });
    await new Promise(resolve => setTimeout(resolve, SETTLE_MILLISECONDS));
    return stats();
  }

  function native(report: Report) {
    const found = report["native"];
    assert.ok(typeof found === "object" && found !== null && !Array.isArray(found));
    return found;
  }

  before(async () => {
    example = ExampleProcess.start({ entry: "examples/interaction/main.ts" });
    await stats();
  }, { timeout: TIMEOUT_MILLISECONDS });

  after(() => {
    example.kill();
  });

  test("a click reaches the handler with (sender, args), for a component and a raw element", { timeout: TIMEOUT_MILLISECONDS }, async () => {
    const { pid } = example;
    const clicked = act({
      pid,
      id: "click-component",
      action: "invoke"
    });
    assert.equal(clicked.name, "component 1", "the text follows the state");
    const report = await stats();
    assert.equal(report["componentClicks"], 1);
    assert.match(String(report["lastClick"]), /^object:object:/u);

    const raw = act({
      pid,
      name: "raw 0",
      action: "invoke"
    });
    assert.equal(raw.name, "raw 1");
    assert.match(String((await stats())["log"]), /raw:object:object/u);
  });

  test("two-way bind: reaches the component from the control, and the control from the component", { timeout: TIMEOUT_MILLISECONDS }, async () => {
    const { pid } = example;
    // ToggleSwitch.isOn
    act({
      pid,
      id: "toggle",
      action: "toggle"
    });
    let report = await stats();
    assert.equal(report["isOn"], true);
    assert.equal(native(report)["toggle"], true);
    await set({
      name: "isOn",
      value: false
    });
    assert.equal(
      read({
        pid,
        id: "toggle"
      }).toggle, "Off"
    );

    // TextBox.text, and the text events it raises
    const before = Number((await stats())["textChanges"]);
    act({
      pid,
      id: "text",
      action: "set-value",
      value: "typed"
    });
    report = await stats();
    assert.equal(report["text"], "typed");
    assert.equal(native(report)["text"], "typed");
    assert.ok(Number(report["textChanges"]) > before, "TextChanged reached the handler");
    await set({
      name: "text",
      value: "from svelte"
    });
    assert.equal(
      read({
        pid,
        id: "text"
      }).value, "from svelte"
    );

    // Slider.value
    act({
      pid,
      id: "slider",
      action: "set-range",
      value: "42"
    });
    assert.equal((await stats())["sliderValue"], 42);
    await set({
      name: "sliderValue",
      value: 7
    });
    assert.equal(
      read({
        pid,
        id: "slider"
      }).range, 7
    );

    // NumberBox.value
    act({
      pid,
      id: "number",
      action: "set-range",
      value: "17"
    });
    assert.equal((await stats())["numberValue"], 17);
    await set({
      name: "numberValue",
      value: 3
    });
    assert.equal(
      read({
        pid,
        id: "number"
      }).range, 3
    );

    // ComboBox selection
    act({
      pid,
      id: "combo",
      action: "select-item",
      item: "two"
    });
    report = await stats();
    assert.equal(report["comboIndex"], 2);
    assert.equal(native(report)["combo"], 2);
    report = await set({
      name: "comboIndex",
      value: 0
    });
    assert.equal(native(report)["combo"], 0);

    // CheckBox.isChecked
    act({
      pid,
      id: "check",
      action: "toggle"
    });
    assert.equal((await stats())["isChecked"], true);
    await set({
      name: "isChecked",
      value: false
    });
    assert.equal(
      read({
        pid,
        id: "check"
      }).toggle, "Off"
    );

    // RadioButtons.selectedIndex
    act({
      pid,
      id: "radio-1",
      action: "select"
    });
    assert.equal((await stats())["radioIndex"], 1);
    await set({
      name: "radioIndex",
      value: 0
    });
    assert.equal(
      read({
        pid,
        id: "radio-0"
      }).selected, true
    );
  });

  test("{#if}, keyed {#each} (in a StackPanel and a Grid), {#await} and {#key} follow the state", { timeout: TIMEOUT_MILLISECONDS }, async () => {
    const { pid } = example;
    await set({
      name: "isShown",
      value: false
    });
    assert.equal(
      exists({
        pid,
        id: "if-block"
      }), false
    );
    assert.equal(
      exists({
        pid,
        id: "else-block"
      }), true
    );
    await set({
      name: "isShown",
      value: true
    });
    assert.equal(
      exists({
        pid,
        id: "if-block"
      }), true
    );

    assert.deepEqual(
      names({
        pid,
        pattern: LIST_ITEM
      }), ["a0", "b1", "c2"]
    );
    await set({
      name: "names",
      value: "c,a,d"
    });
    assert.deepEqual(
      names({
        pid,
        pattern: LIST_ITEM
      }), ["c0", "a1", "d2"], "moved, removed and inserted by key"
    );
    assert.deepEqual(
      names({
        pid,
        pattern: GRID_CELL
      }), ["c@0", "a@1", "d@2"]
    );
    await set({
      name: "names",
      value: ""
    });
    assert.deepEqual(
      names({
        pid,
        pattern: LIST_ITEM
      }), []
    );
    await set({
      name: "names",
      value: "x,y"
    });
    assert.deepEqual(
      names({
        pid,
        pattern: GRID_CELL
      }), ["x@0", "y@1"]
    );

    assert.equal(
      read({
        pid,
        id: "await"
      }).name, "pending"
    );
    await example.ask({
      command: {
        cmd: "resolve"
      },
      kind: "stats"
    });
    await stats();
    assert.equal(
      read({
        pid,
        id: "await"
      }).name, "then resolved"
    );
    await example.ask({
      command: {
        cmd: "renew"
      },
      kind: "stats"
    });
    await example.ask({
      command: {
        cmd: "reject"
      },
      kind: "stats"
    });
    await stats();
    assert.equal(
      read({
        pid,
        id: "await"
      }).name, "catch rejected"
    );

    act({
      pid,
      id: "keyed-button",
      action: "invoke"
    });
    act({
      pid,
      id: "keyed-button",
      action: "invoke"
    });
    assert.equal(
      read({
        pid,
        id: "keyed-button"
      }).name, "keyed 2"
    );
    await set({
      name: "counterKey",
      value: 1
    });
    assert.equal(
      read({
        pid,
        id: "keyed-button"
      }).name, "keyed 0", "a new key makes a new component"
    );
  });

  test("snippets, $state, $derived and $effect update the controls", { timeout: TIMEOUT_MILLISECONDS }, async () => {
    const { pid } = example;
    assert.equal(
      read({
        pid,
        id: "snippet"
      }).name, "snippet direct"
    );
    assert.equal(
      read({
        pid,
        id: "card-header"
      }).name, "header card"
    );
    assert.equal(
      read({
        pid,
        id: "card-body"
      }).name, "body"
    );
    await set({
      name: "rounds",
      value: 3
    });
    assert.equal(
      read({
        pid,
        id: "derived"
      }).name, "derived 6"
    );
    assert.match(String((await stats())["log"]), /effect:rounds=3/u);
  });

  test("class:, style: and class arrays, use:, {@attach}, <svelte:element> and <svelte:boundary>", { timeout: TIMEOUT_MILLISECONDS }, async () => {
    const { pid } = example;
    let report = await stats();
    assert.equal(native(report)["styledOpacity"], 1);
    assert.equal(native(report)["arrayOpacity"], 1);
    assert.match(String(report["log"]), /action:styled/u, "the action ran");
    assert.match(String(report["handles"]), /styled/u, "the attachment ran");

    report = await set({
      name: "isHot",
      value: true
    });
    assert.equal(native(report)["styledOpacity"], 0.25, "class: and style: reach the control");
    assert.equal(native(report)["arrayOpacity"], 0.25, "a class array reaches the control");
    report = await set({
      name: "isHot",
      value: false
    });
    assert.equal(native(report)["styledOpacity"], 1);
    assert.equal(native(report)["arrayOpacity"], 1);

    assert.equal(native(report)["dynamic"], "TextBlock");
    report = await set({
      name: "tag",
      value: "button"
    });
    assert.equal(native(report)["dynamic"], "Button", "the element's tag changes");
    assert.equal(
      exists({
        pid,
        id: "boundary"
      }), false
    );
    await set({
      name: "isBombArmed",
      value: true
    });
    assert.equal(
      read({
        pid,
        id: "boundary"
      }).name, "failed boom"
    );
    await set({
      name: "isBombArmed",
      value: false
    });
    act({
      pid,
      id: "boundary-reset",
      action: "invoke"
    });
    await set({
      name: "isBombArmed",
      value: false
    });
    assert.equal(
      exists({
        pid,
        id: "boundary"
      }), false, "the boundary recovers when reset"
    );
  });

  test("context, onMount cleanup and unmount release the controls", { timeout: TIMEOUT_MILLISECONDS }, async () => {
    const { pid } = example;
    assert.equal(
      read({
        pid,
        id: "lifecycle"
      }).name, "context dark"
    );
    let report = await stats();
    assert.match(String(report["log"]), /lifecycle:mounted/u);
    assert.match(String(report["handles"]), /lifecycle/u);

    report = await set({
      name: "isLifecycleShown",
      value: false
    });
    const log = String(report["log"]);
    for (const line of ["lifecycle:mount-cleanup", "lifecycle:effect-cleanup", "lifecycle:destroyed"]) {
      assert.ok(log.includes(line), `${line} ran`);
    }

    assert.doesNotMatch(String(report["handles"]), /lifecycle/u, "the control was let go");
    assert.equal(
      exists({
        pid,
        id: "lifecycle"
      }), false
    );
  });
});

describe("keyboard", { skip: !IS_WINDOWS_APP_SDK_RESTORED }, () => {
  let example: ExampleProcess;

  before(async () => {
    example = ExampleProcess.start({
      entry: "examples/interaction/main.ts",
      flags: ["--view", "keyboard"]
    });
    await example.ask({
      command: {
        cmd: "stats"
      },
      kind: "stats"
    });
  }, { timeout: TIMEOUT_MILLISECONDS });

  after(() => {
    example.kill();
  });

  test("Tab walks the focus in tree order and Enter presses the focused button", { timeout: TIMEOUT_MILLISECONDS }, async () => {
    const { pid } = example;
    act({
      pid,
      id: "tab-1",
      action: "focus"
    });
    act({
      pid,
      id: "tab-1",
      action: "press",
      value: String(VK_TAB)
    });
    act({
      pid,
      id: "tab-1",
      action: "press",
      value: String(VK_TAB)
    });
    act({
      pid,
      id: "tab-1",
      action: "press",
      value: String(VK_ENTER)
    });
    const report = await example.ask({
      command: {
        cmd: "stats"
      },
      kind: "stats"
    });
    const focusOrder = String(report["log"]).split("|").filter(line => line.startsWith("focus:"));
    assert.deepEqual(focusOrder, ["focus:tab-1", "focus:tab-2", "focus:tab-3"]);
    assert.equal(report["enterPresses"], 1);
  });
});

describe("hot reload", { skip: !IS_WINDOWS_APP_SDK_RESTORED }, () => {
  const panel = path.join(import.meta.dirname, "..", "examples", "interaction", "HotPanel.svelte");
  const original = readFileSync(panel, "utf8");
  let example: ExampleProcess;

  async function labelOf(pid: number) {
    return read({
      pid,
      id: "hot-label"
    }).name;
  }

  async function waitForLabel({ pid, text }: {
    pid: number;
    text: string;
  }) {
    const deadline = Date.now() + HOT_MILLISECONDS;
    while (Date.now() < deadline) {
      const label = await labelOf(pid);
      if (label.includes(text)) {
        return label;
      }

      await new Promise(resolve => setTimeout(resolve, SETTLE_MILLISECONDS));
    }

    throw new Error(`the window never showed "${text}"`);
  }

  before(async () => {
    example = ExampleProcess.start({ entry: "examples/interaction/main.ts" });
    await example.ask({
      command: {
        cmd: "stats"
      },
      kind: "stats"
    });
  }, { timeout: TIMEOUT_MILLISECONDS });

  after(() => {
    writeFileSync(panel, original);
    example.kill();
  });

  test("an edited component is swapped in the open window and the state outside it is kept", { timeout: TIMEOUT_MILLISECONDS }, async () => {
    const { pid } = example;
    for (let i = 0; i < 2; i++) {
      act({
        pid,
        id: "hot-button",
        action: "invoke"
      });
    }

    assert.equal(await labelOf(pid), "hot version A count 2 tally 2");
    writeFileSync(panel, original.replace("version A", "version B"));
    const label = await waitForLabel({
      pid,
      text: "version B"
    });
    assert.match(label, /tally 2$/u, "state outside the component is kept");
    act({
      pid,
      id: "hot-button",
      action: "invoke"
    });
    assert.match(await labelOf(pid), /version B count \d tally 3$/u, "the new component is live");
  });
});
