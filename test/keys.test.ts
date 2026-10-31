import type { Report } from "./example-process.ts";
import { ExampleProcess, IS_WINDOWS_APP_SDK_RESTORED, numberOf } from "./example-process.ts";
import { post } from "./messages.ts";
import assert from "node:assert/strict";
import { test } from "node:test";

// The keyboard's routes into a WinUI window, driven by posting window messages
// to the content of the keys example (examples/keys) through its own message
// queue, the one the real keyboard's messages arrive in. The message pump
// offers each message to ContentPreTranslateMessage before TranslateMessage
// and DispatchMessage, as WinUI's own loop does (src/window/message-pump.ts):
// accelerators, access keys, focus navigation and the text input path are
// handled there. Skipped where the Windows App SDK was not restored.

const TIMEOUT_MILLISECONDS = 300_000;
const SETTLE_MILLISECONDS = 400;

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

async function press({ example, steps }: {
  example: ExampleProcess;
  steps: string;
}) {
  post({
    pid: example.pid,
    steps
  });
  await pause(SETTLE_MILLISECONDS);
  return stateOf(example);
}

async function focus({ example, id }: {
  example: ExampleProcess;
  id: string;
}) {
  example.send({
    cmd: "focus",
    id
  });
  await pause(SETTLE_MILLISECONDS);
}

function textAndSelection(state: Report) {
  return `${String(state["text"])}|${numberOf({
    report: state,
    field: "selectionStart"
  })}+${numberOf({
    report: state,
    field: "selectionLength"
  })}`;
}

test("keys reach the controls through the pump: focus order, accelerator, access key, typing, dialog", {
  skip: !IS_WINDOWS_APP_SDK_RESTORED,
  timeout: TIMEOUT_MILLISECONDS
}, async context => {
  const example = ExampleProcess.start({ entry: "examples/keys/main.ts" });
  try {
    await stateOf(example);
    example.send({ cmd: "activate" });
    await pause(SETTLE_MILLISECONDS);
    await focus({
      example,
      id: "first"
    });

    await context.test("Tab and Shift+Tab move focus along the tab order", async () => {
      example.send({ cmd: "clearLogs" });
      const forward = await press({
        example,
        steps: "key:Tab;sleep:150;key:Tab;sleep:150;key:Tab"
      });
      assert.equal(String(forward["focusLog"]), "input,last,open-dialog");
      example.send({ cmd: "clearLogs" });
      post({
        pid: example.pid,
        steps: "hold:Shift;key:Tab;sleep:150;key:Tab;release:Shift"
      });
      await pause(SETTLE_MILLISECONDS);
      const backward = await stateOf(example);
      assert.equal(String(backward["focusLog"]), "last,input");
    });

    await context.test("Space presses the focused button", async () => {
      await focus({
        example,
        id: "first"
      });
      const before = numberOf({
        report: await stateOf(example),
        field: "clicks"
      });
      const after = await press({
        example,
        steps: "key:Space"
      });
      assert.equal(
        numberOf({
          report: after,
          field: "clicks"
        }), before + 1
      );
    });

    await context.test("Ctrl+S invokes the KeyboardAccelerator wherever the focus is", async () => {
      await focus({
        example,
        id: "input"
      });
      const state = await press({
        example,
        steps: "hold:Ctrl;key:S;release:Ctrl"
      });
      assert.equal(
        numberOf({
          report: state,
          field: "saves"
        }), 1
      );
    });

    await context.test("Alt then F activates the access key", async () => {
      await focus({
        example,
        id: "first"
      });
      const state = await press({
        example,
        steps: "hold:Alt;syskey:F;sleep:200;release:Alt"
      });
      assert.equal(
        numberOf({
          report: state,
          field: "accessInvocations"
        }), 1
      );
    });

    await context.test("characters typed reach a focused TextBox, and Backspace, Delete, arrows, Home, End and Shift+arrows edit it", async () => {
      await focus({
        example,
        id: "input"
      });
      const typed = await press({
        example,
        steps: "key:H;key:E;key:L;key:L;key:O"
      });
      assert.equal(textAndSelection(typed), "hello|5+0");
      assert.equal(
        textAndSelection(
          await press({
            example,
            steps: "key:Back"
          })
        ), "hell|4+0"
      );
      assert.equal(
        textAndSelection(
          await press({
            example,
            steps: "key:Left;key:Left;key:Delete"
          })
        ), "hel|2+0"
      );
      assert.equal(
        textAndSelection(
          await press({
            example,
            steps: "key:Home"
          })
        ), "hel|0+0"
      );
      assert.equal(
        textAndSelection(
          await press({
            example,
            steps: "key:End"
          })
        ), "hel|3+0"
      );
      assert.equal(
        textAndSelection(
          await press({
            example,
            steps: "hold:Shift;key:Left;key:Left;release:Shift"
          })
        ), "hel|1+2"
      );
    });

    await context.test("WM_CHAR types Unicode: Hebrew, and a Chinese character through WM_IME_CHAR", async () => {
      await focus({
        example,
        id: "input"
      });
      const hebrew = await press({
        example,
        steps: "key:End;type:שלום"
      });
      assert.equal(String(hebrew["text"]), "helשלום");
      const chinese = await press({
        example,
        steps: "raw:WM_IME_CHAR,0x4E2D,1"
      });
      assert.equal(String(chinese["text"]), "helשלום中");
    });

    await context.test("Enter presses the default button of a ContentDialog and Escape closes it", async () => {
      await focus({
        example,
        id: "open-dialog"
      });
      example.send({ cmd: "clearLogs" });
      const opened = await press({
        example,
        steps: "key:Space"
      });
      assert.equal(opened["isDialogOpen"], true);
      await pause(SETTLE_MILLISECONDS);
      const confirmed = await press({
        example,
        steps: "key:Enter"
      });
      assert.equal(confirmed["isDialogOpen"], false);
      assert.equal(String(confirmed["results"]), "1");
      await focus({
        example,
        id: "open-dialog"
      });
      await press({
        example,
        steps: "key:Space"
      });
      await pause(SETTLE_MILLISECONDS);
      const dismissed = await press({
        example,
        steps: "key:Escape"
      });
      assert.equal(dismissed["isDialogOpen"], false);
      assert.equal(String(dismissed["results"]), "1,0");
    });
  } finally {
    example.send({ cmd: "close" });
    example.kill();
  }
});
