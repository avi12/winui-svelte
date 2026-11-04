import type { Json } from "#src/messaging/json.js";
import { createWindowModuleRunner } from "#src/vite/runner.js";
import type { WindowOptions } from "#src/window/create-window.js";
import type * as WindowModule from "#src/window/index.js";
import { runOnUiThread } from "#src/window/thread.js";
import type { MessagePort } from "node:worker_threads";

/** The window's chrome `startDev` takes: what `createWindow` takes besides the content and the owner. */
export type DevWindowChrome = Omit<Extract<WindowOptions<object>, { component: unknown }>, "component" | "owner" | "props">;

/** What the dev window's thread is started with. */
export interface DevWindowData {
  modules: MessagePort;
  component: string;
  props: Record<string, Json>;
  window: DevWindowChrome;
}

/**
 * The window's side of `startDev`: enters the apartment, loads the component
 * through the module server (so a saved file updates the open window) and
 * opens it in a window.
 */
export async function runDevWindow(data: DevWindowData) {
  await runOnUiThread(async () => {
    const { runner } = createWindowModuleRunner(data.modules);
    const { createWindow, runWindow } = await runner.import<typeof WindowModule>("winui-svelte/window");
    const { default: component } = await runner.import(data.component);
    await runWindow({
      onStart() {
        createWindow({
          ...data.window,
          component,
          props: data.props
        });
      }
    });
  });
}
