import path from "node:path";
import { Worker } from "node:worker_threads";
import { initWindowsAppSdk } from "winui-svelte/bootstrap";

// The host: it starts the window's thread and knows nothing of the tray. The
// build finds entrypoints/tray.ts by its name and writes tray.js beside this
// file's bundle; an installer or a launcher starts it with startTray().
initWindowsAppSdk();
new Worker(path.join(import.meta.dirname, "window.js"));
