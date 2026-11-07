import { activateOrLaunch, createStandaloneTray, MenuItemKind } from "winui-svelte/tray/standalone";

createStandaloneTray({
  icon: "tray.ico",
  menu: [{
    kind: MenuItemKind.COMMAND,
    id: "open",
    label: "Open",
    onselect() {
      void activateOrLaunch({
        key: "tray-only",
        activation: {
          arguments: [],
          workingDirectory: "."
        },
        launch: {
          command: "app.exe"
        }
      });
    }
  }]
});
