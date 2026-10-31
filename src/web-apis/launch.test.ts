import assert from "node:assert/strict";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { test } from "node:test";

// The Launch Handler API over a temporary FOLDER: the initial command line
// waits for the consumer, later activations are delivered, arguments become
// targetURL and files, and a file is the file-system API's own handle.

const { installLaunch } = await import("./launch.ts");
const { FileSystemFileHandle } = await import("./file-system.ts");

const FOLDER = mkdtempSync(path.join(tmpdir(), "launch-"));
const NOTES = path.join(FOLDER, "NOTES.txt");
writeFileSync(NOTES, "hello");

test.after(() => {
  rmSync(FOLDER, {
    recursive: true,
    force: true
  });
});

test("the start's command line waits for the consumer, then arrives as params", async () => {
  const uninstall = installLaunch({ initialArguments: [NOTES, "myapp://open?id=1", path.join(FOLDER, "missing.bin")] });
  try {
    const received = await new Promise<{
      targetURL: string | undefined;
      names: string[];
      areHandles: boolean[];
    }>(resolve => {
      launchQueue.setConsumer(params => {
        resolve({
          targetURL: params.targetURL,
          names: params.files.map(file => file.name),
          areHandles: params.files.map(file => file instanceof FileSystemFileHandle)
        });
      });
    });
    assert.deepEqual(received, {
      targetURL: "myapp://open?id=1",
      names: ["NOTES.txt"],
      areHandles: [true]
    });
  } finally {
    uninstall();
  }
});

test("a later activation reaches the consumer and its file reads back", async () => {
  const uninstall = installLaunch({ initialArguments: [] });
  try {
    const texts: string[] = [];
    launchQueue.setConsumer(async params => {
      for (const file of params.files) {
        texts.push(await (await file.getFile()).text());
      }
    });
    await launchQueue.enqueueActivation({
      arguments: ["NOTES.txt"],
      workingDirectory: FOLDER
    });
    assert.deepEqual(texts, ["hello"]);
  } finally {
    uninstall();
  }

  assert.equal(typeof launchQueue, "undefined");
});
