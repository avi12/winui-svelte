import { DynCom } from "@microsoft/dynwinrt/com/unsafe";
import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { readdirSync, statSync } from "node:fs";
import path from "node:path";
import { test } from "node:test";

// The real jump list in this process, under an AppUserModelID no app uses:
// the tasks are committed, the shell's CustomDestinations folder is checked
// for the file Windows writes for them, the list is deleted, and a failing
// assertion still deletes it. Nothing is injected, and no window is made.

const { joinAppUserModel } = await import("#src/window/native.js");
const { clearJumpList, setJumpListTasks } = await import("./index.ts");
const { createJumpListNative } = await import("./native.ts");

const DESTINATIONS = path.join(process.env["APPDATA"] ?? "", "Microsoft", "Windows", "Recent", "CustomDestinations");
const CLOCK_SKEW_MILLISECONDS = 2000;

function filesChangedSince(since: number) {
  const threshold = since - CLOCK_SKEW_MILLISECONDS;
  return readdirSync(DESTINATIONS).filter(name => statSync(path.join(DESTINATIONS, name)).mtimeMs >= threshold);
}

test("tasks commit to the real jump list and the list is deleted again", () => {
  const appUserModelId = `dev.winui-svelte.test.jumplist${randomBytes(5).toString("hex")}`;
  DynCom.initialize();
  joinAppUserModel(appUserModelId);
  const backend = createJumpListNative();
  assert.equal(backend.currentAppUserModelId(), appUserModelId);
  const started = Date.now();
  try {
    const list = setJumpListTasks({
      appUserModelId,
      tasks: [
        {
          id: "new-note",
          title: "New note",
          arguments: ["--new", "two words"],
          description: "Starts a note",
          icon: process.execPath
        },
        {
          id: "open-inbox",
          title: "Open inbox",
          arguments: []
        }
      ],
      command: {
        program: process.execPath,
        arguments: [path.join("C:", "never", "run", "main.js")]
      },
      backend
    });
    assert.equal(list.tasks.length, 2);
    assert.ok(filesChangedSince(started).length > 0, "Windows wrote no custom destinations file");
  } finally {
    clearJumpList({
      appUserModelId,
      backend
    });
  }
});
