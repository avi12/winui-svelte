import type { RunExample } from "./run-example.ts";
import { createWindowModuleRunner } from "#src/vite/runner.js";
import { runOnUiThread } from "#src/window/thread.js";
import { MessagePort, workerData } from "node:worker_threads";
import { z } from "zod";

// The UI thread of an example: its apartment first, then every module the
// example needs through the module server (run-example.ts and what it
// imports; WinUI's loop takes the thread once the window runs).

const RUN_EXAMPLE_MODULE = "/examples/harness/run-example.ts";

const portsSchema = z.object({
  modules: z.instanceof(MessagePort),
  link: z.instanceof(MessagePort),
  entry: z.string(),
  options: z.record(z.string(), z.string())
});

await runOnUiThread(async () => {
  const parsedPorts = portsSchema.safeParse(workerData);
  if (!parsedPorts.success) {
    throw new Error("the host passed no ports");
  }

  const data = parsedPorts.data;
  const { runner } = createWindowModuleRunner(data.modules);
  const { runExample } = await runner.import<{ runExample: RunExample }>(RUN_EXAMPLE_MODULE);
  await runExample({
    entry: data.entry,
    link: data.link,
    options: data.options
  });
});
