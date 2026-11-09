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

test("a window takes the drags of other apps through an OLE drop target, in the zones only", {
  skip: !IS_WINDOWS_APP_SDK_RESTORED,
  timeout: TIMEOUT_MILLISECONDS
}, async () => {
  const folder = await mkdtemp(path.join(tmpdir(), "winui-svelte-ole-"));
  const example = ExampleProcess.start({ entry: "examples/data-transfer/main.ts" });
  function drag(command: Record<string, string | boolean>) {
    return example.ask({
      command: {
        cmd: "oleDrag",
        path: folder,
        ...command
      },
      kind: "oleDragged"
    });
  }

  try {
    const inZone = await drag({
      enterAt: "zone",
      overAt: "zone",
      shouldDrop: true
    });
    assert.equal(inZone["isRegistered"], true, "the window registered an OLE drop target");
    assert.equal(inZone["enter"], COPY, "a folder over a zone that accepts directories shows copy");
    assert.equal(inZone["over"], COPY);
    assert.equal(inZone["drop"], COPY, "the drop is accepted as a copy");
    const [first] = logOf(inZone);
    const details = JSON.parse(String(first));
    assert.deepEqual(details.files, [`${path.basename(folder)}:directory:`], "the handler read the folder");
    assert.ok(details.types.includes("Files"));

    const outside = await drag({
      enterAt: "outside",
      overAt: "outside",
      shouldDrop: true
    });
    assert.equal(outside["enter"], 0, "no zone under the cursor shows the forbidden sign");
    assert.equal(outside["over"], 0);
    assert.equal(outside["drop"], 0);

    const refused = await drag({
      enterAt: "text",
      overAt: "text",
      shouldDrop: false
    });
    assert.equal(refused["over"], 0, "a zone that accepts only text refuses a folder");

    const moved = await drag({
      enterAt: "zone",
      overAt: "outside",
      shouldDrop: false
    });
    assert.equal(moved["enter"], COPY);
    assert.equal(moved["over"], 0, "leaving the zone for the rest of the window refuses");
    assert.equal(moved["isOver"], false, "the zone was told the drag left");
  } finally {
    example.kill();
    await rm(folder, {
      recursive: true,
      force: true
    });
  }
});
