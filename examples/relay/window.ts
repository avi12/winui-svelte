import { MessagePort, parentPort, workerData } from "node:worker_threads";
import { runOnUiThread } from "winui-svelte/thread";
import { z } from "zod";

// The relay example's UI thread, as the bundle runs it. The host's frames
// arrive on a MessagePort; a message from the parent asks it to quit.

const workerDataSchema = z.object({ link: z.instanceof(MessagePort) });

await runOnUiThread(async () => {
  const parsedData = workerDataSchema.safeParse(workerData);
  if (!parsedData.success) {
    throw new Error("the host passed no port");
  }

  const { createHostChannel, createMessagePortTransport } = await import("winui-svelte/state");
  const { exitApplication, exitWhenHostEnds, runWindow } = await import("winui-svelte/window");
  const { mountControl } = await import("winui-svelte");
  const { default: appComponent } = await import("./RelayApp.svelte");
  const channel = createHostChannel({
    transport: createMessagePortTransport({ port: parsedData.data.link })
  });
  parentPort?.on("message", () => exitApplication());
  await runWindow({
    onStart() {
      exitWhenHostEnds({ link: channel });
      mountControl({
        component: appComponent,
        props: {
          channel,
          report: (message: object) => parentPort?.postMessage(message)
        }
      });
    }
  });
});
