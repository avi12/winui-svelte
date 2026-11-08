import { defaultProgressRegistry, progressText } from "winui-svelte/progress/core";
import { createStandaloneTray, MenuColorScheme, MenuItemKind } from "winui-svelte/tray/standalone";

function progressLine() {
  return [{
    kind: MenuItemKind.COMMAND,
    id: "progress",
    label: progressText(defaultProgressRegistry().snapshot),
    onselect() {}
  }];
}

createStandaloneTray({
  icon: "first.ico",
  colorScheme: MenuColorScheme.DARK,
  menu: progressLine
});

createStandaloneTray({
  icon: "second.ico",
  colorScheme: MenuColorScheme.LIGHT,
  menu: [{
    kind: MenuItemKind.COMMAND,
    id: "quit",
    label: "Quit",
    onselect() {
      process.exit(0);
    }
  }]
});
