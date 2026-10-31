import type { CounterView, ViewReport } from "./app-types.ts";
import { VIEW_NAME } from "./app-types.ts";
import { MessagePort, parentPort, workerData } from "node:worker_threads";
import { runOnUiThread } from "winui-svelte/thread";
import { z } from "zod";

// The production example's UI thread, as the bundle runs it: Node alone, no
// dev server and no Svelte compiler. The host's state arrives on a
// MessagePort; the reports go back to the host through the worker's parent.

const workerDataSchema = z.object({ port: z.instanceof(MessagePort) });
const commandSchema = z.object({ cmd: z.string() });
const CLOSE_COMMAND = "close";

await runOnUiThread(async () => {
  const parsedData = workerDataSchema.safeParse(workerData);
  if (!parsedData.success) {
    throw new Error("the host passed no port");
  }

  const { createHostChannel, createMessagePortTransport, hostState } = await import("winui-svelte/state");
  const { createWindow, exitApplication, runWindow } = await import("winui-svelte/window");
  const { default: appComponent } = await import("./App.svelte");
  const channel = createHostChannel({
    transport: createMessagePortTransport({ port: parsedData.data.port })
  });
  parentPort?.on("message", message => {
    const command = commandSchema.safeParse(message);
    const isClose = command.success && command.data.cmd === CLOSE_COMMAND;
    if (isClose) {
      exitApplication();
    }
  });
  await runWindow({
    onStart() {
      createWindow({
        component: appComponent,
        props: {
          view: hostState<CounterView>({
            channel,
            name: VIEW_NAME
          }),
          report: (message: ViewReport) => parentPort?.postMessage(message)
        },
        title: "production-example",
        isBackground: process.env["WINUI_SVELTE_BACKGROUND"] === "1"
      });
    }
  });
});
