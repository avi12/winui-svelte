import { startWindowsAppSdk } from "#examples/bootstrap.ts";
import path from "node:path";
import { MessageChannel, Worker } from "node:worker_threads";
import { createStdioTransport, reserveStdout } from "winui-svelte/state/host";

// The relay example's process, shaped like a sidecar that a native core
// starts with its stdin and stdout piped: this thread owns the pipes and
// relays their JSON lines to the window's thread over a MessagePort. The
// window (window.ts) has a tray icon, a Mica backdrop, the system settings and
// a file watcher. A message on the process channel (`send`) asks it to quit,
// like the core's quit action (test/idle-cpu.test.ts, test/quit.test.ts).

reserveStdout();
startWindowsAppSdk();

const link = new MessageChannel();
const worker = new Worker(path.join(import.meta.dirname, "window.js"), {
  workerData: {
    link: link.port2
  },
  transferList: [link.port2]
});
const hostTransport = createStdioTransport();
const stopListening = hostTransport.listen({
  message(frame) {
    link.port1.postMessage(frame);
  },
  malformed(reason) {
    process.stderr.write(`malformed line: ${reason}\n`);
  },
  closed() {
    process.exit(0);
  }
});
link.port1.on("message", frame => hostTransport.send(frame));
process.on("message", message => worker.postMessage(message));
worker.on("message", message => process.send?.(message));
worker.on("error", error => {
  process.stderr.write(`${error.stack ?? String(error)}\n`);
  process.exitCode = 1;
});
worker.on("exit", code => {
  stopListening();
  link.port1.close();
  process.exitCode = process.exitCode ?? code;
  process.disconnect?.();
});
