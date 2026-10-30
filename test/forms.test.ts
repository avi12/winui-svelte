import { ExampleProcess, IS_WINDOWS_APP_SDK_RESTORED } from "./example-process.ts";
import { act, names, read } from "./uia.ts";
import assert from "node:assert/strict";
import { after, before, describe, test } from "node:test";

// The form example (examples/form) in a real WinUI window, off screen: the
// controls are filled in and the buttons pressed through UI Automation (no
// real input), then what the form shows and what it submitted are read back.
// Skipped where the Windows App SDK was not restored.

const TIMEOUT_MILLISECONDS = 300_000;
const SETTLE_MILLISECONDS = 400;
const POLL_MILLISECONDS = 250;
const POLL_ATTEMPTS = 40;
const REQUIRED_MESSAGE = "Fill in this field";

describe("form", { skip: !IS_WINDOWS_APP_SDK_RESTORED }, () => {
  let example: ExampleProcess;

  async function stats() {
    return example.ask({
      command: {
        cmd: "stats"
      },
      kind: "stats"
    });
  }

  async function settle() {
    await new Promise(resolve => setTimeout(resolve, SETTLE_MILLISECONDS));
  }

  async function submittedCount(expected: number) {
    for (let i = 0; i < POLL_ATTEMPTS; i++) {
      const report = await stats();
      const isReached = report["submitted"] === expected;
      if (isReached) {
        return report;
      }

      await new Promise(resolve => setTimeout(resolve, POLL_MILLISECONDS));
    }

    throw new Error(`the form did not reach ${expected} submissions`);
  }

  async function notSaving(pid: number) {
    for (let i = 0; i < POLL_ATTEMPTS; i++) {
      const isSaving = read({
        pid,
        id: "result"
      }).name === "Saving...";
      if (!isSaving) {
        return;
      }

      await new Promise(resolve => setTimeout(resolve, POLL_MILLISECONDS));
    }
  }

  before(async () => {
    example = ExampleProcess.start({ entry: "examples/form/main.ts" });
    await stats();
  }, { timeout: TIMEOUT_MILLISECONDS });

  after(() => {
    example.kill();
  });

  test("submitting an empty form shows each field's error and submits nothing", { timeout: TIMEOUT_MILLISECONDS }, async () => {
    const { pid } = example;
    act({
      pid,
      id: "submit",
      action: "invoke"
    });
    await settle();
    const required = names({
      pid,
      pattern: new RegExp(REQUIRED_MESSAGE, "u")
    });
    assert.equal(required.length, 4, "name, e-mail, plan and the terms are required");
    assert.match(
      read({
        pid,
        id: "result"
      }).name, /^Fix: name, email, plan, accepted$/u
    );
    assert.equal((await stats())["submitted"], 0);
  });

  test("a wrong e-mail shows the type error once the field is filled", { timeout: TIMEOUT_MILLISECONDS }, async () => {
    const { pid } = example;
    act({
      pid,
      id: "email",
      action: "set-value",
      value: "nope"
    });
    await settle();
    assert.equal(
      names({
        pid,
        pattern: /Enter a value of the right type/u
      }).length, 1
    );
  });

  test("a filled form submits typed data through the schema", { timeout: TIMEOUT_MILLISECONDS }, async () => {
    const { pid } = example;
    act({
      pid,
      id: "name",
      action: "set-value",
      value: "Ada Lovelace"
    });
    act({
      pid,
      id: "email",
      action: "set-value",
      value: "ada@example.com"
    });
    act({
      pid,
      id: "plan",
      action: "select-item",
      item: "Pro"
    });
    act({
      pid,
      id: "accepted",
      action: "toggle"
    });
    await settle();
    act({
      pid,
      id: "submit",
      action: "invoke"
    });
    const report = await submittedCount(1);
    assert.deepEqual(JSON.parse(String(report["last"])), {
      name: "Ada Lovelace",
      email: "ada@example.com",
      age: 30,
      plan: "Pro",
      newsletter: false,
      accepted: true
    });
  });

  test("reset puts the fields back and clears the errors", { timeout: TIMEOUT_MILLISECONDS }, async () => {
    const { pid } = example;
    await notSaving(pid);
    act({
      pid,
      id: "reset",
      action: "focus"
    });
    await settle();
    act({
      pid,
      id: "reset",
      action: "invoke"
    });
    await settle();
    assert.equal(
      read({
        pid,
        id: "name"
      }).value, ""
    );
    assert.equal(
      read({
        pid,
        id: "result"
      }).name, "Reset"
    );
    assert.equal(
      names({
        pid,
        pattern: new RegExp(REQUIRED_MESSAGE, "u")
      }).length, 0
    );
  });
});
