import { defineTray, MenuItemKind } from "winui-svelte/tray/standalone";

// One tray entrypoint, one process, two notification-area icons, and no window
// anywhere: each defineTray has its own guid and menu (and could have its own
// colorScheme); the build reads icon, tooltip and guid from the literals.
// The first guid names the process, so keep the order.
function quit() {
  process.exit(0);
}

export default [
  defineTray({
    icon: "tray.ico",
    tooltip: "Recorder",
    guid: "3b0f6a3e-61b7-4e5b-8a55-6d9a4b0c1e01",
    menu: [
      {
        kind: MenuItemKind.COMMAND,
        id: "record",
        label: "Record screen",
        onselect() {}
      }
    ]
  }),
  defineTray({
    icon: "tray.ico",
    tooltip: "Uploads",
    guid: "3b0f6a3e-61b7-4e5b-8a55-6d9a4b0c1e02",
    colorScheme: "dark",
    menu: [
      {
        kind: MenuItemKind.COMMAND,
        id: "quit",
        label: "Quit both",
        onselect: quit
      }
    ]
  })
];
