import { createWindowsRegistry } from "#src/app/activation/native.js";
import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { existsSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { test } from "node:test";

// The real Windows calls, in a folder this test creates under the temp
// directory and removes: a file is recycled, and a shortcut is written and
// read back. No user file is touched, and no dialog is shown.

const { registerAppPath, unregisterAppPath } = await import("./app-paths.ts");
const { createShortcut, readShortcut } = await import("./shortcut.ts");
const { trash } = await import("./trash.ts");

test("a temp file goes to the Recycle Bin and a shortcut reads back", () => {
  const directory = mkdtempSync(path.join(tmpdir(), "wsv-shell-"));
  try {
    const file = path.join(directory, "target.txt");
    const link = path.join(directory, "target.lnk");
    writeFileSync(file, "x");
    const created = createShortcut({
      path: link,
      target: file,
      arguments: ["one two", "three"],
      workingDirectory: directory,
      icon: {
        path: path.join(process.env["SystemRoot"] ?? "C:\\Windows", "System32", "shell32.dll"),
        index: 3
      },
      description: "A test shortcut"
    });
    assert.deepEqual(created, { ok: true });
    const read = readShortcut({ path: link });
    assert.equal(read.ok, true);
    assert.equal(read.ok ? read.target.toLowerCase() : "", file.toLowerCase());
    assert.equal(read.ok ? read.arguments : "", "\"one two\" three");
    assert.equal(read.ok ? read.workingDirectory.toLowerCase() : "", directory.toLowerCase());
    assert.equal(read.ok ? read.icon?.index : -1, 3);
    assert.equal(read.ok ? read.description : "", "A test shortcut");
    assert.deepEqual(trash({ paths: [file] }), { ok: true });
    assert.equal(existsSync(file), false);
  } finally {
    rmSync(directory, {
      recursive: true,
      force: true
    });
  }
});

test("an App Paths alias registers under HKCU and leaves nothing", () => {
  const name = `wsvtest${randomBytes(5).toString("hex")}`;
  const registry = createWindowsRegistry();
  const key = `Software\\Microsoft\\Windows\\CurrentVersion\\App Paths\\${name}.exe`;
  try {
    assert.deepEqual(
      registerAppPath({
        name,
        program: process.execPath,
        registry
      }), { ok: true }
    );
    assert.equal(
      registry.readString({
        key,
        name: ""
      }), process.execPath
    );
  } finally {
    unregisterAppPath({
      name,
      registry
    });
  }

  assert.equal(registry.hasKey(key), false);
});
