import { exitWhenHostEnds } from "./host-link.ts";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { test } from "node:test";

const POLL_MILLISECONDS = 20;
const WAIT_MILLISECONDS = 500;

function wait(milliseconds: number) {
  return new Promise(resolve => setTimeout(resolve, milliseconds));
}

test("the link closing ends the process, once", () => {
  const listeners: (() => void)[] = [];
  let exits = 0;
  exitWhenHostEnds({
    link: {
      onClosed(listener) {
        listeners.push(listener);
      }
    },
    exit() {
      exits += 1;
    }
  });
  assert.equal(exits, 0);
  for (const listener of listeners) {
    listener();
    listener();
  }

  assert.equal(exits, 1);
});

test("the host process ending ends the process, though the link stays open", async () => {
  const host = spawn(process.execPath, ["-e", "setInterval(() => {}, 1000)"], { stdio: "ignore" });
  const hostProcessId = host.pid ?? 0;
  let exits = 0;
  const stop = exitWhenHostEnds({
    hostProcessId,
    pollMilliseconds: POLL_MILLISECONDS,
    exit() {
      exits += 1;
    }
  });
  await wait(WAIT_MILLISECONDS);
  assert.equal(exits, 0, "a running host keeps the process");

  const exited = new Promise(resolve => host.on("exit", resolve));
  host.kill();
  await exited;
  await wait(WAIT_MILLISECONDS);
  assert.equal(exits, 1);
  stop();
});

test("stopping the watch ends nothing", async () => {
  let exits = 0;
  const stop = exitWhenHostEnds({
    hostProcessId: 0x7fffffff,
    pollMilliseconds: POLL_MILLISECONDS,
    exit() {
      exits += 1;
    }
  });
  stop();
  await wait(WAIT_MILLISECONDS);
  assert.equal(exits, 0);
});
