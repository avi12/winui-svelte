import { ExampleProcess, IS_WINDOWS_APP_SDK_RESTORED } from "./example-process.ts";
import type { Report } from "./example-process.ts";
import assert from "node:assert/strict";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { test } from "node:test";

// The data transfer example (examples/data-transfer) in a real WinUI window,
// off screen and never activated. Drops are made by handing a real data package
// to the handlers a drop reaches (simulateDrop): no mouse or keyboard input is
// sent, and the user's clipboard is not touched. Skipped where the Windows App
// SDK was not restored.

const TIMEOUT_MILLISECONDS = 300_000;
const COPY = 1;
const LINK = 4;

function logOf(report: Report) {
  const { log } = report;
  return Array.isArray(log) ? log.map(String) : [];
}

test("a window gives the share manager through the interop call, with no package identity", {
  skip: !IS_WINDOWS_APP_SDK_RESTORED,
  timeout: TIMEOUT_MILLISECONDS
}, async () => {
  const example = ExampleProcess.start({ entry: "examples/data-transfer/main.ts" });
  try {
    const report = await example.ask({
      command: {
        cmd: "shareManager"
      },
      kind: "shareManager"
    });
    assert.equal(report["error"], undefined, "GetForWindow raised no error");
    assert.equal(report["isManager"], true, "GetForWindow returned a DataTransferManager that takes DataRequested");
    example.send({ cmd: "close" });
    assert.equal(await example.exited, 0);
  } finally {
    example.kill();
  }
});

test("a control takes drops through the dropzone and the web event names", {
  skip: !IS_WINDOWS_APP_SDK_RESTORED,
  timeout: TIMEOUT_MILLISECONDS
}, async () => {
  const folder = await mkdtemp(path.join(tmpdir(), "winui-svelte-drop-"));
  const example = ExampleProcess.start({ entry: "examples/data-transfer/main.ts" });
  try {
    await writeFile(path.join(folder, "note.txt"), "file body");
    await writeFile(path.join(folder, "pixel.png"), "not really a picture");
    const state = await example.ask({
      command: {
        cmd: "state"
      },
      kind: "state"
    });
    assert.equal(state["zoneAllowsDrop"], true, "dropzone sets AllowDrop");
    assert.equal(state["rawAllowsDrop"], true, "ondrop sets AllowDrop on a raw element");
    assert.equal(state["sourceCanDrag"], true, "draggable sets CanDrag");

    const dropped = await example.ask({
      command: {
        cmd: "drop",
        target: "zone",
        text: "dropped text",
        paths: [path.join(folder, "note.txt"), path.join(folder, "pixel.png")]
      },
      kind: "dropped"
    });
    assert.equal(dropped["accepted"], COPY, "the zone answered the copy cursor");
    const [first] = logOf(dropped);
    const details = JSON.parse(String(first));
    assert.deepEqual(details.files, ["note.txt:file:file body"], "accept kept the .txt and left the picture");
    assert.equal(details.text, "dropped text");
    assert.ok(details.types.includes("Files"));

    const raw = await example.ask({
      command: {
        cmd: "drop",
        target: "raw",
        html: "<b>x</b>",
        paths: [folder]
      },
      kind: "dropped"
    });
    assert.equal(raw["accepted"], LINK, "the handler's preventDefault and dropEffect decided");
    assert.equal(JSON.parse(String(logOf(raw)[1])).html, "<b>x</b>");

    example.send({ cmd: "close" });
    assert.equal(await example.exited, 0);
  } finally {
    example.kill();
    await rm(folder, {
      recursive: true,
      force: true
    });
  }
});
