import { ExampleProcess, IS_WINDOWS_APP_SDK_RESTORED } from "./example-process.ts";
import type { Report } from "./example-process.ts";
import assert from "node:assert/strict";
import { readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { test } from "node:test";

// Each app of examples/ in a real WinUI window, off screen and never
// activated: it opens, shows its key control and closes with exit code 0.
// Skipped where the Windows App SDK was not restored.

const TIMEOUT_MILLISECONDS = 300_000;

function presentIn(report: Report) {
  const present = report["present"];
  return Array.isArray(present) ? present : [];
}

async function closed(example: ExampleProcess) {
  example.send({ cmd: "close" });
  assert.equal(await example.exited, 0);
}

test("the gallery shows each of its pages", {
  skip: !IS_WINDOWS_APP_SDK_RESTORED,
  timeout: TIMEOUT_MILLISECONDS
}, async () => {
  const example = ExampleProcess.start({
    entry: "examples/gallery/main.ts",
    flags: []
  });
  try {
    const pages = await example.ask({
      command: {
        cmd: "pages"
      },
      kind: "pages"
    });
    const keys = Array.isArray(pages["keys"]) ? pages["keys"] : [];
    assert.ok(keys.length > 0);
    for (const key of keys) {
      const shown = await example.settled({
        command: {
          cmd: "navigate",
          to: String(key)
        },
        kind: "navigated"
      });
      assert.ok(presentIn(shown).includes(key), `the ${String(key)} page shows its key control`);
    }

    await closed(example);
  } finally {
    example.kill();
  }
});

const SINGLE_WINDOW_APPS = [
  "todo",
  "settings"
];

for (const name of SINGLE_WINDOW_APPS) {
  test(`the ${name} app opens, shows its key control and closes`, {
    skip: !IS_WINDOWS_APP_SDK_RESTORED,
    timeout: TIMEOUT_MILLISECONDS
  }, async () => {
    const example = ExampleProcess.start({
      entry: `examples/${name}/main.ts`,
      flags: ["--file", path.join(tmpdir(), `winui-svelte-${name}-test.json`)]
    });
    try {
      const shown = await example.settled({
        command: {
          cmd: "stats"
        },
        kind: "stats"
      });
      assert.ok(presentIn(shown).includes(name), `the ${name} app shows its key control`);
      await closed(example);
    } finally {
      example.kill();
    }
  });
}

test("a task added in the todo app is saved to its file", {
  skip: !IS_WINDOWS_APP_SDK_RESTORED,
  timeout: TIMEOUT_MILLISECONDS
}, async () => {
  const file = path.join(tmpdir(), "winui-svelte-todo-saved-test.json");
  rmSync(file, { force: true });
  const example = ExampleProcess.start({
    entry: "examples/todo/main.ts",
    flags: ["--file", file]
  });
  try {
    await example.ask({
      command: {
        cmd: "add",
        title: "Write the README"
      },
      kind: "added"
    });
    await closed(example);
    assert.match(readFileSync(file, "utf8"), /Write the README/u);
  } finally {
    example.kill();
    rmSync(file, { force: true });
  }
});
