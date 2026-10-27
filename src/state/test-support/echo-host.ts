import { defineMessaging } from "#src/messaging/index.js";
import { diff } from "#src/state/diff.js";
import type { Json, StateProtocol } from "#src/state/protocol.js";
import { isJsonObject, MessageType } from "#src/state/protocol.js";
import { createStdioTransport, reserveStdout } from "#src/state/transports/stdio.js";

// A host in a child process, for stdio.test.ts: it owns { count } and
// answers { kind: "increment" }, { kind: "fail" } and { kind: "log" } (which
// prints with console.log, to prove stdout stays the protocol's).

reserveStdout();
const messaging = defineMessaging<StateProtocol>({
  transport: createStdioTransport(),
  onError: error => process.stderr.write(`host: ${error.message}\n`)
});
let state: Json = { count: 0 };

// The window going away rejects what is waiting; the process ends with its
// stdin, so there is nothing to do about it.
function ignoreClosed() {}

function publish(next: Json) {
  messaging.sendMessage(MessageType.patch, {
    name: "counter",
    ops: diff({
      previous: state,
      next
    })
  }).catch(ignoreClosed);
  state = next;
}

messaging.onMessage(MessageType.action, message => {
  const action = message.data;
  const kind = isJsonObject(action) ? action["kind"] : undefined;
  const count = isJsonObject(state) ? state["count"] : undefined;
  const canIncrement = kind === "increment" && typeof count === "number";
  if (canIncrement) {
    publish({ count: count + 1 });
  } else if (kind === "fail") {
    throw new Error("asked to fail");
  } else if (kind === "log") {
    console.log("noise that must not reach stdout");
  }
});
messaging.sendMessage(MessageType.snapshot, {
  name: "counter",
  value: state
}).catch(ignoreClosed);
