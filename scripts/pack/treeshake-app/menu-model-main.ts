import { MenuItemKind, resolveMenu } from "winui-svelte/tray/menu";

console.log(
  resolveMenu({
    items: [{
      kind: MenuItemKind.COMMAND,
      id: "open",
      label: "Open"
    }]
  })
);
