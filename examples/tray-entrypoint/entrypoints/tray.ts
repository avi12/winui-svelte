import {
  activateOrLaunch,
  defineTray,
  MenuItemKind,
  MenuLevel,
  resolveMenu
} from "winui-svelte/tray/standalone";

// The tray is its own entrypoint: the build bundles this file apart into
// tray.js, reading icon, tooltip and guid from the literals below without
// running it. main.ts and window.ts never import it.
const APP_KEY = "tray-entrypoint-example";

function openApp() {
  void activateOrLaunch({
    key: APP_KEY,
    activation: {
      arguments: [],
      workingDirectory: "."
    },
    launch: {
      command: process.execPath,
      arguments: ["main.js"]
    }
  });
}

export default defineTray({
  icon: "tray.ico",
  tooltip: "Tray entrypoint example",
  guid: "7d1c5a52-3f1b-4a63-9f5e-2f4d6b0c8a11",
  onactivate: openApp,
  resolve: resolveMenu,
  menu: [
    {
      kind: MenuItemKind.COMMAND,
      id: "open",
      label: "Open",
      isRequired: true,
      onselect: openApp
    },
    {
      kind: MenuItemKind.COMMAND,
      id: "capture",
      label: "Capture region",
      level: MenuLevel.STANDARD
    },
    {
      kind: MenuItemKind.COMMAND,
      id: "record",
      label: "Record screen",
      level: MenuLevel.FULL
    }
  ]
});
