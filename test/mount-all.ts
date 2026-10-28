import type { Report } from "./mount-report.ts";
import { initWinappsdk } from "@microsoft/dynwinrt";
import { startModuleServer } from "#src/vite/server.js";
import path from "node:path";
import { MessageChannel, Worker } from "node:worker_threads";

// Mounts every generated component in a real WinUI window, run in the
// background: off screen and never activated. It prints one JSON line, the
// report of test/mount-all.svelte.ts, and exits 1 when anything failed.
//
// The window's thread cannot take imports once WinUI runs, so the worker
// (mount-all.worker.ts) loads every module from this thread's Vite server
// first.

const WINDOWS_APP_SDK_MAJOR = 2;
const WINDOWS_APP_SDK_MINOR = 2;
const PACKAGE_ROOT = path.join(import.meta.dirname, "..");

process.env["WINAPPSDK_BOOTSTRAP_DLL_PATH"] ??= path.join(
  PACKAGE_ROOT,
  ".winapp",
  "bin",
  process.arch,
  "Microsoft.WindowsAppRuntime.Bootstrap.dll"
);
initWinappsdk(WINDOWS_APP_SDK_MAJOR, WINDOWS_APP_SDK_MINOR);

const modules = new MessageChannel();
const server = await startModuleServer({
  root: PACKAGE_ROOT,
  configFile: path.join(PACKAGE_ROOT, "examples", "harness", "vite.config.ts"),
  port: modules.port1
});
const worker = new Worker(new URL("mount-all.worker.ts", import.meta.url), {
  workerData: {
    modules: modules.port2
  },
  transferList: [modules.port2]
});
let report: Report | null = null;
worker.on("message", message => {
  report = message;
});
worker.on("error", error => {
  process.stderr.write(`${error.stack ?? String(error)}\n`);
  process.exitCode = 1;
});
worker.on("exit", async code => {
  await server.close();
  process.stdout.write(`${JSON.stringify(report)}\n`);
  process.exit(process.exitCode ?? code);
});
