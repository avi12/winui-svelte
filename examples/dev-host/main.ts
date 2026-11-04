import { startDev } from "winui-svelte/dev";

// A Tauri (or any stdio) sidecar in development: the framework that starts
// this process owns the state and speaks JSON lines on its pipes, and a saved
// file updates the open window (test/dev.test.ts checks it).
//
//   node main.ts

process.exitCode = await startDev({
  root: import.meta.dirname,
  configFile: `${import.meta.dirname}/vite.config.ts`,
  component: "/App.svelte",
  host: "stdio",
  window: {
    title: "Dev host",
    isBackground: process.env["WINUI_SVELTE_BACKGROUND"] === "1"
  }
});
