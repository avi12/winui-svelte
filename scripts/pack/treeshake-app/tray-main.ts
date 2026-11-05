import { activateOrLaunch, createStandaloneTray, NativeMenuEntryKind } from "winui-svelte/tray/standalone";

createStandaloneTray({
  icon: "tray.ico",
  menu: [{
    kind: NativeMenuEntryKind.COMMAND,
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
