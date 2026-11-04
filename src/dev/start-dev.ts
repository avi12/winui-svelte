import type { DevWindowChrome, DevWindowData } from "./dev-window.ts";
import type { Json } from "#src/messaging/json.js";
import type { Transport } from "#src/state/host.js";
import { createStdioTransport, reserveStdout } from "#src/state/host.js";
import { startModuleServer } from "#src/vite/server.js";
import { initWindowsAppSdk } from "#src/window/bootstrap.js";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { MessageChannel, Worker } from "node:worker_threads";

/** What `startDev` opens and where its modules come from. */
export interface DevOptions {
  /** The folder of the app's sources, which the dev server serves and watches. */
  root: string;

  /** The window's root component, as a path under `root` that starts with a slash (`"/App.svelte"`). */
  component: string;

  /** The component's props: JSON, since they cross to the window's thread. */
  props?: Record<string, Json>;

  /** The window's title, size, backdrop and the other chrome `createWindow` takes, besides its content and owner. */
  window?: DevWindowChrome;

  /**
   * The app's link to the framework that starts it (a Tauri core, an Electron
   * main process, a script): `"stdio"` when it started this process as a
   * sidecar and speaks JSON lines on its pipes, or a transport of its own
   * (`utilityProcess`'s parent port, say). The component then gets a
   * `channel` prop (`hostState`, `channel.send`), and the window closes when
   * the link ends.
   */
  host?: "stdio" | Transport;

  /** The app's Vite config, whose plugins should include `winuiSvelte()`; the plugin's defaults serve without one. */
  configFile?: string;

  /** Modules Node loads itself rather than Vite: an app's own native modules. */
  isNative?: (file: string) => boolean;
}

// The window's thread is a worker that loads this package's dev-window module,
// from source (.ts) or from the published package (.js).
const WINDOW_MODULE = path.join(import.meta.dirname, `dev-window${path.extname(import.meta.filename)}`);
const WORKER_SOURCE = `const { workerData } = require("node:worker_threads");
import(workerData.moduleUrl).then(module => module.runDevWindow(workerData.data));`;

// The host's transport and the window's end of a MessageChannel, joined: what
// the host sends reaches the window, what the window sends reaches the host.
function linkTo(host: "stdio" | Transport) {
  const isStdio = host === "stdio";
  if (isStdio) {
    reserveStdout();
  }

  const transport = isStdio ? createStdioTransport() : host;
  const link = new MessageChannel();
  transport.listen({
    message: frame => link.port1.postMessage(frame),
    malformed: reason => process.stderr.write(
      `host: malformed message: ${reason}
`
    ),
    closed: () => link.port1.close()
  });
  link.port1.on("message", frame => transport.send(frame));
  return link;
}

/**
 * Opens the app in a window and keeps it live: a saved `.svelte` or `.ts`
 * file updates the open window without a restart. It starts the Windows App
 * SDK, a Vite dev server for the app's modules and the window's thread, so the
 * host is one call:
 *
 * ```ts
 * import { startDev } from "winui-svelte/dev";
 *
 * process.exitCode = await startDev({
 *   root: import.meta.dirname,
 *   component: "/App.svelte",
 *   window: { title: "My app" }
 * });
 * ```
 *
 * @returns The exit code, once the window has closed and the dev server has stopped.
 */
export async function startDev({ component, props = {}, window = {}, host, ...serverOptions }: DevOptions) {
  const link = host === undefined ? null : linkTo(host);
  initWindowsAppSdk();
  const modules = new MessageChannel();
  const server = await startModuleServer({
    ...serverOptions,
    port: modules.port1
  });
  const data: DevWindowData = {
    modules: modules.port2,
    link: link?.port2 ?? null,
    component,
    props,
    window
  };
  const worker = new Worker(WORKER_SOURCE, {
    eval: true,
    workerData: {
      moduleUrl: pathToFileURL(WINDOW_MODULE).href,
      data
    },
    transferList: link === null ? [modules.port2] : [modules.port2, link.port2]
  });
  worker.on("error", error => {
    process.stderr.write(`${error.stack ?? String(error)}\n`);
    process.exitCode = 1;
  });
  const code = await new Promise<number>(resolve => {
    worker.on("exit", resolve);
  });
  await server.close();
  return process.exitCode ?? code;
}
