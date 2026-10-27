import { createStdioTransport } from "./stdio.ts";
import type { Json } from "#src/messaging/json.js";
import "#src/state/test-support/svelte-runes.js";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import path from "node:path";
import { PassThrough } from "node:stream";
import { test } from "node:test";

const { createHostChannel, HostError, hostState } = await import("#src/state/channel.svelte.js");

// A hung host must fail the test, not hold the run open.
const HOST_TIMEOUT_MILLISECONDS = 30_000;
const ECHO_HOST = path.join(import.meta.dirname, "..", "test-support", "echo-host.ts");

// Extends a record of Json: an interface alone is not assignable to Json, as
// it has no index signature.
interface Counter extends Record<string, Json> {
  count: number;
}

test("state and actions round-trip with a host in a child process over stdio", { timeout: HOST_TIMEOUT_MILLISECONDS }, async testContext => {
  const child = spawn(process.execPath, ["--disable-warning=ExperimentalWarning", ECHO_HOST], { stdio: ["pipe", "pipe", "pipe"] });
  const stderr: string[] = [];
  child.stderr.on("data", chunk => stderr.push(String(chunk)));
  const errors: Error[] = [];
  const channel = createHostChannel({
    transport: createStdioTransport({
      input: child.stdout,
      output: child.stdin
    }),
    onError: error => errors.push(error)
  });
  // The after hook also runs when the timeout abandons the test body.
  testContext.after(() => {
    channel.dispose();
    child.kill();
  });
  const counter = hostState<Counter>({
    channel,
    name: "counter"
  });
  assert.deepEqual(await counter.ready, { count: 0 });

  await channel.send({ kind: "increment" });
  await channel.send({ kind: "increment" });
  assert.equal(counter.current?.count, 2, "patches arrive before their replies");

  await assert.rejects(channel.send({ kind: "fail" }), error => error instanceof HostError && error.message === "asked to fail");

  // Output of the host's own console.log went to stderr: stdout held only
  // protocol lines (anything else would have been reported as unreadable).
  await channel.send({ kind: "log" });
  assert.deepEqual(errors, []);
  assert.match(stderr.join(""), /noise that must not reach stdout/u);
});

test("a line that is not JSON is reported as malformed, and later lines still arrive", async () => {
  const input = new PassThrough();
  const output = new PassThrough();
  const seen: string[] = [];
  const stop = createStdioTransport({
    input,
    output
  }).listen({
    message: value => seen.push(`message:${JSON.stringify(value)}`),
    malformed: () => seen.push("malformed"),
    closed: () => seen.push("closed")
  });
  input.write("not json\n\n{\"a\":1}\n");
  input.end();
  await new Promise(resolve => setTimeout(resolve, 20));
  stop();
  assert.deepEqual(seen, ["malformed", "message:{\"a\":1}", "closed"]);
});
