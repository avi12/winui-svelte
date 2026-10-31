import { startWindowsAppSdk } from "#examples/bootstrap.ts";
import path from "node:path";
import { MessageChannel, Worker } from "node:worker_threads";
import type { Json } from "winui-svelte/state/host";
import { createMessagePortTransport, createStdioTransport, reserveStdout } from "winui-svelte/state/host";

// A Tauri (or any stdio) sidecar: the process's main thread owns the pipes and
// relays every value, unread, to the window's worker over a MessageChannel;
// the window builds its channel on createMessagePortTransport. The window
// cannot read the pipes itself: a worker's process.stdin is not the process's.
// The window file is examples/production/window.ts built next to this one.

reserveStdout();
startWindowsAppSdk();

const link = new MessageChannel();
const worker = new Worker(path.join(import.meta.dirname, "window.js"), {
  workerData: {
    port: link.port2
  },
  transferList: [link.port2]
});
const core = createStdioTransport<Json>();
const window = createMessagePortTransport<Json>({ port: link.port1 });

function report(reason: string) {
  process.stderr.write(`relay: ${reason}\n`);
}

core.listen({
  message: value => window.send(value),
  malformed: report,
  closed: () => link.port1.close()
});
window.listen({
  message: value => core.send(value),
  malformed: report,
  closed: () => process.exit(0)
});
worker.on("exit", code => process.exit(code));
