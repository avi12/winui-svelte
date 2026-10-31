import type { ExampleHost } from "#examples/harness/contract.ts";
import { serveExample } from "#examples/harness/smoke.ts";
import { WindowHandle } from "#src/window/window-handle.js";
import { Grid } from "#src/winui.js";
import { installPage, usePageWindow } from "winui-svelte/web-apis/page";
import { createWindow } from "winui-svelte/window";

// A window with nothing in it, and the page API following it: the entry
// test/page.test.ts starts, off screen on its own desktop.

function snapshot(seen: string[]) {
  return {
    kind: "page",
    visibilityState: document.visibilityState,
    isHidden: document.hidden,
    hasFocus: document.hasFocus(),
    title: document.title,
    windowState: document.windowState ?? "",
    hasFullscreenElement: document.fullscreenElement !== null,
    seen
  };
}

export function start(host: ExampleHost) {
  const seen: string[] = [];
  installPage();
  const app = createWindow({
    control: new Grid(),
    title: "Page example",
    isBackground: true
  });
  const handle = new WindowHandle(app.window);
  usePageWindow(handle);
  for (const type of ["visibilitychange", "fullscreenchange"]) {
    document.addEventListener(type, () => seen.push(type));
  }

  for (const type of ["focus", "blur", "beforeunload"]) {
    globalThis.addEventListener(type, () => seen.push(type));
  }

  const commands = new Map([
    ["page", () => host.report(snapshot(seen))],
    ["minimize", () => handle.minimize()],
    ["restore", () => handle.restore()],
    ["retitle", () => {
      document.title = "Renamed";
    }],
    ["fullscreen", () => {
      void document.requestWindowState?.("fullscreen");
    }],
    ["leave-fullscreen", () => {
      void document.exitFullscreen();
    }],
    ["compact", () => {
      void document.requestWindowState?.("compact-overlay");
    }],
    ["clear", () => seen.splice(0)]
  ]);
  serveExample({
    host,
    commands
  });
}
