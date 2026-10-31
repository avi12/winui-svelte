import { ExampleProcess, IS_WINDOWS_APP_SDK_RESTORED } from "./example-process.ts";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { test } from "node:test";

// The app subpath (examples/app) in real windows, off screen: the first copy
// is primary, a second copy with the same key detects it and exits, and high
// contrast is read. The first copy hears the second copy's arguments over the
// named pipe. Whether a notification shows from node.exe is reported, not asserted: it depends on the identity
// the platform accepts (see API.md, App lifecycle). Skipped where the Windows
// App SDK was not restored.

const TIMEOUT_MILLISECONDS = 300_000;

test("a second copy redirects to the first, which hears it", {
  skip: !IS_WINDOWS_APP_SDK_RESTORED,
  timeout: TIMEOUT_MILLISECONDS
}, async context => {
  const flags = ["--key", `dev.winui-svelte.test.${randomUUID()}`];
  const first = ExampleProcess.start({
    entry: "examples/app/main.ts",
    flags
  });
  let second: ExampleProcess | undefined;
  try {
    const stats = await first.settled({
      command: {
        cmd: "stats"
      },
      kind: "stats"
    });
    assert.equal(stats["isPrimary"], true);
    assert.equal(typeof stats["isHighContrast"], "boolean");

    second = ExampleProcess.start({
      entry: "examples/app/main.ts",
      flags
    });
    assert.equal(await second.exited, 0, "the second copy exits on its own");

    const heard = await first.settled({
      command: {
        cmd: "stats"
      },
      kind: "stats"
    });
    assert.equal(heard["redirects"], 1);
    assert.match(String(heard["lastArguments"]), new RegExp(flags[1] ?? "", "u"));

    const notified = await first.ask({
      command: {
        cmd: "notify"
      },
      kind: "notified"
    });
    context.diagnostic(`notify from node.exe: ${JSON.stringify(notified)}`);
    assert.ok("id" in notified || "error" in notified);

    first.send({ cmd: "close" });
    assert.equal(await first.exited, 0);
  } finally {
    first.kill();
    second?.kill();
  }
});

test("the application ends cleanly when its last window closes, with its timers running", {
  skip: !IS_WINDOWS_APP_SDK_RESTORED,
  timeout: TIMEOUT_MILLISECONDS
}, async () => {
  const example = ExampleProcess.start({
    entry: "examples/app/main.ts",
    flags: ["--key", `dev.winui-svelte.test.${randomUUID()}`]
  });
  try {
    const stats = await example.settled({
      command: {
        cmd: "stats"
      },
      kind: "stats"
    });
    assert.equal(stats["isPrimary"], true, "the single-instance listener is running");

    example.send({ cmd: "closeWindowOnly" });
    assert.equal(await example.exited, 0, "no tick reads a control that is gone");
  } finally {
    example.kill();
  }
});
