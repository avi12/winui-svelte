import { ExampleProcess, IS_WINDOWS_APP_SDK_RESTORED } from "./example-process.ts";
import assert from "node:assert/strict";
import { test } from "node:test";

// Global hotkeys (winui-svelte/app/hotkeys) in a real window (examples/hotkeys):
// an obscure combination is registered with RegisterHotKey, the message
// Windows would post for it is posted to the thread by the example itself
// (PostThreadMessageW), the callback runs once, and after unregistering the
// same combination can be registered again. No key is pressed and no input
// is injected. Skipped where the Windows App SDK was not restored.

const TIMEOUT_MILLISECONDS = 300_000;
const KEYS = "ctrl+alt+shift+f23";
const SETTLE_MILLISECONDS = 600;

function pause(milliseconds: number) {
  return new Promise(resolve => setTimeout(resolve, milliseconds));
}

async function stateOf(example: ExampleProcess) {
  return example.ask({
    command: {
      cmd: "state"
    },
    kind: "state"
  });
}

test("a posted WM_HOTKEY runs the callback once; unregistering frees the combination", {
  skip: !IS_WINDOWS_APP_SDK_RESTORED,
  timeout: TIMEOUT_MILLISECONDS
}, async () => {
  const example = ExampleProcess.start({ entry: "examples/hotkeys/main.ts" });
  try {
    const registered = await example.ask({
      command: {
        cmd: "register",
        keys: KEYS
      },
      kind: "registered"
    });
    assert.equal(registered["isRegistered"], true);
    assert.equal(registered["presses"], 0);
    const wasVisible = registered["isWindowVisible"];

    const conflict = await example.ask({
      command: {
        cmd: "register",
        keys: "shift+alt+ctrl+f23"
      },
      kind: "refused"
    });
    assert.equal(conflict["name"], "HotkeyConflictError");

    example.send({ cmd: "press" });
    await pause(SETTLE_MILLISECONDS);
    const pressed = await stateOf(example);
    assert.equal(pressed["presses"], 1);
    assert.notEqual(pressed["isWindowVisible"], wasVisible, "the hotkey toggled the window");

    const unregistered = await example.ask({
      command: {
        cmd: "unregister"
      },
      kind: "unregistered"
    });
    assert.equal(unregistered["isRegistered"], false);

    example.send({ cmd: "press" });
    await pause(SETTLE_MILLISECONDS);
    assert.equal((await stateOf(example))["presses"], 1, "an unregistered hotkey is not heard");

    const again = await example.ask({
      command: {
        cmd: "register",
        keys: KEYS
      },
      kind: "registered"
    });
    assert.equal(again["isRegistered"], true);
    assert.notEqual(again["id"], registered["id"]);
  } finally {
    await example.stop();
  }
});
