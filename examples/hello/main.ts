import { startDev } from "winui-svelte/dev";

// The host: it opens App.svelte in a window and keeps it live, so a saved
// file updates the open window.
//
//   node main.ts

const WINDOW_WIDTH = 480;
const WINDOW_HEIGHT = 320;

process.exitCode = await startDev({
  root: import.meta.dirname,
  configFile: `${import.meta.dirname}/vite.config.ts`,
  component: "/App.svelte",
  window: {
    title: "Hello",
    size: {
      width: WINDOW_WIDTH,
      height: WINDOW_HEIGHT
    },
    isBackground: process.env["WINUI_SVELTE_BACKGROUND"] === "1"
  }
});
