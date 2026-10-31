import { createMessagePortTransport } from "./message-port.ts";
import type { Json } from "#src/messaging/json.js";
import assert from "node:assert/strict";
import { test } from "node:test";
import { MessageChannel } from "node:worker_threads";

function listenerInto(seen: Json[]) {
  return {
    message: (value: Json) => seen.push(value),
    malformed() {},
    closed() {}
  };
}

test("messages cross a port by its events", async () => {
  const { port1, port2 } = new MessageChannel();
  const seen: Json[] = [];
  const stop = createMessagePortTransport({ port: port1 }).listen(listenerInto(seen));
  createMessagePortTransport<Json>({ port: port2 }).send({
    type: "x",
    n: 1
  });
  await new Promise(resolve => setTimeout(resolve, 20));
  stop();
  port1.close();
  port2.close();
  assert.deepEqual(seen, [{
    type: "x",
    n: 1
  }]);
});

test("a transport that should not keep the thread alive leaves the port unreferenced", () => {
  const { port1, port2 } = new MessageChannel();
  const stop = createMessagePortTransport({
    port: port1,
    shouldKeepAlive: false
  }).listen(listenerInto([]));
  assert.equal(port1.hasRef(), false);
  stop();
  port1.close();
  port2.close();
});
