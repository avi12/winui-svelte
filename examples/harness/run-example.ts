import type { ExampleCommand, ExampleHost } from "./contract.ts";
import { exampleCommandSchema, exampleModuleSchema } from "./contract.ts";
import * as bindings from "#src/components/generated/bindings.js";
import { registerControls } from "#src/renderer/host/host.js";
import { runWindow } from "#src/window/index.js";
import type { MessagePort } from "node:worker_threads";

// Loaded through the module server, like an app's own modules: the example's
// start() runs on the UI thread once WinUI is up, and the host's commands
// arrive as messages on the port, which the window's loop delivers once the
// window has had its first frames (WinUI lays out on its own schedule, and a
// command that arrives before the first layout finds nothing realized).

const FIRST_FRAMES_MILLISECONDS = 30;

export interface ExampleRun {
  entry: string;
  link: MessagePort;
  options: Record<string, string>;
}

export type RunExample = (run: ExampleRun) => Promise<void>;

export async function runExample({ entry, link, options }: ExampleRun) {
  const parsedExample = exampleModuleSchema.safeParse(await import(/* @vite-ignore */ entry));
  if (!parsedExample.success) {
    throw new Error(`${entry} exports no start()`);
  }

  const { start } = parsedExample.data;
  const isBare = parsedExample.data.IS_BARE === true;
  const handlers: Array<(command: ExampleCommand) => void> = [];
  const host: ExampleHost = {
    report: message => link.postMessage(message),
    onCommand(handler) {
      handlers.push(handler);
    },
    options
  };
  await runWindow({
    onStart() {
      if (!isBare) {
        registerControls(bindings);
      }

      start(host);
      setTimeout(() => {
        link.on("message", message => {
          const parsedCommand = exampleCommandSchema.safeParse(message);
          if (!parsedCommand.success) {
            return;
          }

          for (const handler of handlers) {
            handler(parsedCommand.data);
          }
        });
      }, FIRST_FRAMES_MILLISECONDS);
    }
  });
}
