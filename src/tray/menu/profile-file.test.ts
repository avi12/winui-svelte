import { defaultProfile, loadProfile, MenuLevel, saveProfile } from "./index.ts";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { test } from "node:test";

test("a profile is saved and loaded; a missing or broken file gives the default", () => {
  const folder = mkdtempSync(path.join(tmpdir(), "menu-profile-"));
  try {
    const file = path.join(folder, "deep", "menu.json");
    assert.deepEqual(loadProfile({ file }), defaultProfile());
    const profile = {
      level: MenuLevel.FULL,
      hidden: ["a"],
      shown: [],
      order: {
        "": ["b"]
      }
    };
    saveProfile({
      file,
      profile
    });
    assert.deepEqual(loadProfile({ file }), profile);
    writeFileSync(file, "{ not json");
    assert.deepEqual(
      loadProfile({
        file,
        level: MenuLevel.STANDARD
      }), defaultProfile({ level: MenuLevel.STANDARD })
    );
  } finally {
    rmSync(folder, {
      recursive: true,
      force: true
    });
  }
});
