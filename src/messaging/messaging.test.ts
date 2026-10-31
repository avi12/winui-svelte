import { defineMessaging, MessagingClosedError, MessagingError } from "./messaging.ts";
import type { ProtocolWithReturn } from "./protocol-map.ts";
import { MemoryEnd } from "#src/state/transports/memory.js";
import assert from "node:assert/strict";
import { test } from "node:test";

// The project's enums are as-const objects: Node strips types, so no `enum`.
const PingType = {
  greet: "greet",
  count: "count",
  refresh: "refresh",
  fail: "fail"
} as const;

interface PingProtocol {
  [PingType.greet]: ProtocolWithReturn<{ name: string }, string>;
  [PingType.count]: ProtocolWithReturn<number[], number>;
  [PingType.refresh]: ProtocolWithReturn<void, void>;
  [PingType.fail]: ProtocolWithReturn<void, void>;
}

function pair(onError: (error: Error) => void = () => {}) {
  const [left, right] = MemoryEnd.pair();
  return {
    left,
    right,
    caller: defineMessaging<PingProtocol>({
      transport: left,
      onError
    }),
    callee: defineMessaging<PingProtocol>({
      transport: right,
      onError
    })
  };
}

test("a message resolves with what the other end's handler returns", async () => {
  const { caller, callee } = pair();
  callee.onMessage(PingType.greet, message => `hello ${message.data.name}`);
  callee.onMessage(PingType.count, message => message.data.length);
  assert.equal(await caller.sendMessage(PingType.greet, { name: "Edge" }), "hello Edge");
  assert.equal(await caller.sendMessage(PingType.count, [1, 2, 3]), 3);
});

test("a message with no data is sent without it", async () => {
  const { caller, callee } = pair();
  let refreshes = 0;
  callee.onMessage(PingType.refresh, () => {
    refreshes += 1;
  });
  await caller.sendMessage(PingType.refresh);
  assert.equal(refreshes, 1);
});

test("a handler may answer later", async () => {
  const { caller, callee } = pair();
  callee.onMessage(PingType.greet, async message => {
    await new Promise(resolve => setTimeout(resolve, 5));
    return message.data.name;
  });
  assert.equal(await caller.sendMessage(PingType.greet, { name: "late" }), "late");
});

test("the handler is given the frame's identity", async () => {
  const { caller, callee } = pair();
  let seen = "";
  callee.onMessage(PingType.greet, message => {
    seen = `${message.type}:${message.id}:${typeof message.timestamp}`;
    return "";
  });
  await caller.sendMessage(PingType.greet, { name: "x" });
  assert.equal(seen, "greet:1:number");
});

test("a handler that throws rejects the sender, and is reported", async () => {
  const reported: string[] = [];
  const { caller, callee } = pair(error => reported.push(error.message));
  callee.onMessage(PingType.fail, () => {
    throw new Error("nope");
  });
  await assert.rejects(caller.sendMessage(PingType.fail), error => error instanceof MessagingError && error.message === "nope");
  assert.deepEqual(reported, ["nope"]);
});

test("a message nobody handles rejects the sender", async () => {
  const unhandled: string[] = [];
  const [left, right] = MemoryEnd.pair();
  const caller = defineMessaging<PingProtocol>({ transport: left });
  defineMessaging<PingProtocol>({
    transport: right,
    onUnhandled: frame => unhandled.push(frame.type)
  });
  await assert.rejects(caller.sendMessage(PingType.refresh), /no handler for message "refresh"/u);
  assert.deepEqual(unhandled, ["refresh"]);
});

test("a type takes one handler, and the remover frees it", () => {
  const { callee } = pair();
  const remove = callee.onMessage(PingType.refresh, () => {});
  assert.throws(() => callee.onMessage(PingType.refresh, () => {}), MessagingError);
  remove();
  callee.onMessage(PingType.refresh, () => {});
});

test("both ends can send and handle", async () => {
  const { caller, callee } = pair();
  caller.onMessage(PingType.count, message => message.data.length * 2);
  callee.onMessage(PingType.greet, message => message.data.name);
  assert.equal(await callee.sendMessage(PingType.count, [1, 2]), 4);
  assert.equal(await caller.sendMessage(PingType.greet, { name: "both" }), "both");
});

test("a closed link rejects what waits", async () => {
  const { right, caller } = pair();
  const waiting = caller.sendMessage(PingType.refresh);
  right.close();
  await assert.rejects(waiting, MessagingClosedError);
});

test("an unanswered message times out", async () => {
  const [left] = MemoryEnd.pair();
  const caller = defineMessaging<PingProtocol>({
    transport: left,
    timeoutMilliseconds: 10
  });
  await assert.rejects(caller.sendMessage(PingType.refresh), /no answer to message "refresh"/u);
});

test("a stray frame is reported, not thrown", async () => {
  const reported: string[] = [];
  const [left, right] = MemoryEnd.pair();
  defineMessaging<PingProtocol>({
    transport: right,
    onError: error => reported.push(error.message)
  });
  left.sendJson({ hello: "world" });
  await new Promise(resolve => setTimeout(resolve, 5));
  assert.equal(reported.length, 1);
});

test("a send after the link closed rejects at once, without writing to it", async () => {
  const { right, caller } = pair();
  right.close();
  await new Promise(resolve => setTimeout(resolve, 5));
  await assert.rejects(caller.sendMessage(PingType.refresh), MessagingClosedError);
});

test("onClosed hears the link close", async () => {
  const [left, right] = MemoryEnd.pair();
  let closes = 0;
  defineMessaging<PingProtocol>({
    transport: left,
    onClosed() {
      closes += 1;
    }
  });
  right.close();
  await new Promise(resolve => setTimeout(resolve, 5));
  assert.equal(closes, 1);
});

test("notify leaves nothing unhandled when the link is closed or closes first", async () => {
  const reported: string[] = [];
  const { right, caller } = pair(error => reported.push(error.message));
  caller.notify(PingType.refresh);
  right.close();
  await new Promise(resolve => setTimeout(resolve, 5));
  caller.notify(PingType.refresh);
  await new Promise(resolve => setTimeout(resolve, 5));
  assert.deepEqual(reported, [], "a closed link is no error to report");
});

test("notify reports the other end's failure instead of leaving it unhandled", async () => {
  const reported: string[] = [];
  const { caller, callee } = pair(error => reported.push(error.message));
  callee.onMessage(PingType.fail, () => {
    throw new Error("nope");
  });
  caller.notify(PingType.fail);
  await new Promise(resolve => setTimeout(resolve, 5));
  assert.ok(reported.includes("nope"));
});
