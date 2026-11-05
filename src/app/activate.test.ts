import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { test } from "node:test";
import { receiveMessageOnPort } from "node:worker_threads";

// The tray's way to reach an app: deliver an activation to the copy that
// serves the key's pipe, or start the app when none does.

const { activateInstance, activateOrLaunch, launchApp } = await import("./activate.ts");
const { currentUserSid, openPipe, pipeNameFor } = await import("./instance-pipe.ts");

const ACTIVATION = {
  arguments: ["--show"],
  workingDirectory: process.cwd()
};
const WAIT_MILLISECONDS = 10_000;
const POLL_MILLISECONDS = 25;

async function until(condition: () => boolean) {
  const deadline = Date.now() + WAIT_MILLISECONDS;
  while (!condition() && Date.now() < deadline) {
    await new Promise(resolve => setTimeout(resolve, POLL_MILLISECONDS));
  }
}

test("an activation reaches the copy that serves the key", async () => {
  const key = `test.activate.${randomUUID()}`;
  const server = openPipe({
    pipeName: pipeNameFor({
      key,
      sid: currentUserSid()
    }),
    payload: "{}"
  });
  assert.ok(server.isPrimary);
  try {
    const isDelivered = await activateInstance({
      key,
      activation: ACTIVATION
    });
    assert.equal(isDelivered, true);

    let message: unknown;
    await until(() => {
      message = receiveMessageOnPort(server.port)?.message;
      return message !== undefined;
    });
    assert.deepEqual(message, { value: ACTIVATION });
  } finally {
    server.close();
  }
});

test("an activation with no copy running is not delivered", async () => {
  const isDelivered = await activateInstance({
    key: `test.activate.${randomUUID()}`,
    activation: ACTIVATION
  });
  assert.equal(isDelivered, false);
});

test("launchApp starts a program that runs on its own", async () => {
  const folder = mkdtempSync(path.join(tmpdir(), "winui-svelte-launch-"));
  const marker = path.join(folder, "started.txt");
  try {
    launchApp({
      command: process.execPath,
      arguments: ["-e", `require("node:fs").writeFileSync(${JSON.stringify(marker)}, process.argv[1])`, "launched"]
    });
    await until(() => existsSync(marker));
    assert.equal(readFileSync(marker, "utf8"), "launched");
  } finally {
    rmSync(folder, {
      recursive: true,
      force: true
    });
  }
});

test("activateOrLaunch starts the app only when no copy runs", async () => {
  const folder = mkdtempSync(path.join(tmpdir(), "winui-svelte-launch-"));
  const marker = path.join(folder, "started.txt");
  const key = `test.activate.${randomUUID()}`;
  try {
    const isRunning = await activateOrLaunch({
      key,
      activation: ACTIVATION,
      launch: {
        command: process.execPath,
        arguments: ["-e", `require("node:fs").writeFileSync(${JSON.stringify(marker)}, "x")`]
      }
    });
    assert.equal(isRunning, false);
    await until(() => existsSync(marker));
    assert.ok(existsSync(marker));
  } finally {
    rmSync(folder, {
      recursive: true,
      force: true
    });
  }
});
