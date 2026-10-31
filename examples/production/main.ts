import { VIEW_NAME } from "./app-types.ts";
import { startWindowsAppSdk } from "#examples/bootstrap.ts";
import path from "node:path";
import { createInterface } from "node:readline";
import { MessageChannel, Worker } from "node:worker_threads";
import { defineMessaging } from "winui-svelte/messaging";
import { createMessagePortTransport, diff, MessageType } from "winui-svelte/state/host";
import type { StateProtocol } from "winui-svelte/state/host";
import { z } from "zod";

// The production example's host, built to one bundle with window.ts
// (test/production-build.test.ts): it owns { count }, shows it in a window and
// reports what the window reports, one JSON line each. A line on stdin is a
// command: "increment" counts, anything else goes to the window ("close").

const commandSchema = z.object({ cmd: z.string() });
const INCREMENT_COMMAND = "increment";

startWindowsAppSdk();
process.stdout.write(`pid ${process.pid}\n`);

const link = new MessageChannel();
const worker = new Worker(path.join(import.meta.dirname, "window.js"), {
  workerData: {
    port: link.port2
  },
  transferList: [link.port2]
});
const messaging = defineMessaging<StateProtocol>({
  transport: createMessagePortTransport({ port: link.port1 }),
  onError: error => process.stderr.write(`host: ${error.message}\n`)
});
let state = { count: 0 };

function publish(next: typeof state) {
  void messaging.sendMessage(MessageType.patch, {
    name: VIEW_NAME,
    ops: diff({
      previous: state,
      next
    })
  });
  state = next;
}

void messaging.sendMessage(MessageType.snapshot, {
  name: VIEW_NAME,
  value: state
});
worker.on("message", message => process.stdout.write(`${JSON.stringify(message)}\n`));
createInterface({ input: process.stdin }).on("line", line => {
  const command = commandSchema.safeParse(JSON.parse(line));
  if (!command.success) {
    return;
  }

  const isIncrement = command.data.cmd === INCREMENT_COMMAND;
  if (isIncrement) {
    publish({ count: state.count + 1 });
    return;
  }

  worker.postMessage(command.data);
}).on("close", () => worker.postMessage({ cmd: "close" }));
worker.on("error", error => {
  process.stderr.write(`${error.stack ?? String(error)}\n`);
  process.exitCode = 1;
});
worker.on("exit", code => process.exit(process.exitCode ?? code));
