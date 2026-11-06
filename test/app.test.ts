import { ExampleProcess, IS_WINDOWS_APP_SDK_RESTORED } from "./example-process.ts";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { test } from "node:test";

// The app subpath (examples/app) in real windows, off screen: the first copy
// is primary, a second copy with the same key detects it and exits, and high
// contrast is read. The first copy hears the second copy's arguments over the
// named pipe. Whether a notification shows from node.exe is reported, not asserted: it depends on the identity
// the platform accepts (see API.md, App lifecycle). Skipped where the Windows
// App SDK was not restored.

const TIMEOUT_MILLISECONDS = 300_000;
const WAIT_STEP_MILLISECONDS = 500;
const QUIET_MILLISECONDS = 3000;

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

// The processes whose command line holds `marker`, by process id; the marker
// travels in the environment so the query does not match itself.
function processesWith(marker: string) {
  const output = execFileSync("powershell.exe", [
    "-NoProfile",
    "-Command",
    `Get-CimInstance Win32_Process | Where-Object { $_.CommandLine -like ('*' + $env:APP_TEST_MARKER + '*') } | ForEach-Object { $_.ProcessId }`
  ], {
    encoding: "utf8",
    env: {
      ...process.env,
      APP_TEST_MARKER: marker
    }
  });
  return output.split(/s+/u).filter(Boolean).map(Number);
}

async function waitFor({ isDone, milliseconds }: {
  isDone(): boolean;
  milliseconds: number;
}) {
  const deadline = Date.now() + milliseconds;
  while (Date.now() < deadline && !isDone()) {
    await new Promise(resolve => setTimeout(resolve, WAIT_STEP_MILLISECONDS));
  }

  return isDone();
}

test("the app registers for a restart, and a normal exit is not restarted", {
  skip: !IS_WINDOWS_APP_SDK_RESTORED,
  timeout: TIMEOUT_MILLISECONDS
}, async () => {
  const marker = randomUUID();
  const example = ExampleProcess.start({
    entry: "examples/app/main.ts",
    flags: ["--key", `dev.winui-svelte.test.${randomUUID()}`]
  });
  try {
    const registered = await example.ask({
      command: {
        cmd: "registerRestart",
        key: marker
      },
      kind: "restartRegistered"
    });
    assert.equal(registered["error"], undefined, "Windows accepts the registration");

    example.send({ cmd: "close" });
    assert.equal(await example.exited, 0);
    await new Promise(resolve => setTimeout(resolve, QUIET_MILLISECONDS));
    assert.deepEqual(processesWith(marker), [], "a normal exit starts no copy");
  } finally {
    example.kill();
  }
});

test("relaunch starts a new copy with the given arguments and ends this one", {
  skip: !IS_WINDOWS_APP_SDK_RESTORED,
  timeout: TIMEOUT_MILLISECONDS
}, async () => {
  const marker = randomUUID();
  const example = ExampleProcess.start({
    entry: "examples/app/main.ts",
    flags: ["--key", `dev.winui-svelte.test.${randomUUID()}`]
  });
  let copies: number[] = [];
  try {
    await example.ask({
      command: {
        cmd: "stats"
      },
      kind: "stats"
    });
    example.send({
      cmd: "relaunch",
      key: marker
    });
    assert.equal(await example.exited, 0, "the first copy exits cleanly");
    const isStarted = await waitFor({
      isDone() {
        copies = processesWith(marker);
        return copies.length > 0;
      },
      milliseconds: TIMEOUT_MILLISECONDS / 4
    });
    assert.ok(isStarted, "the new copy runs");
  } finally {
    example.kill();
    for (const copy of processesWith(marker)) {
      process.kill(copy);
    }
  }
});
