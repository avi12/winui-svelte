<script lang="ts">
  import { describeFlyout } from "./describe-flyout.ts";
  import type { ExampleCommand, ExampleHost } from "#examples/harness/contract.ts";
  import { writeIconFile } from "#examples/tray/icon-file.ts";
  import type { MenuFlyout } from "#winui/microsoft/ui/xaml/controls/MenuFlyout";
  import { flush } from "winui-svelte";
  import { Window } from "winui-svelte/components";
  import type { WindowHandle } from "winui-svelte/components";
  import { TrayIcon, TrayMenuFlyout } from "winui-svelte/tray";
  import type { ScreenPoint } from "winui-svelte/tray";
  import { defineMenu, MenuItemKind, MenuLevel, resolveMenu } from "winui-svelte/tray/menu";
  import { TrayMenu, TrayMenuItem, TrayMenuSubmenu } from "winui-svelte/tray/menu/svelte";
  import { exitApplication } from "winui-svelte/window";

  const WINDOW_WIDTH = 360;
  const WINDOW_HEIGHT = 240;
  const { host }: { host: ExampleHost } = $props();
  const ICON = writeIconFile({
    name: "tray-menu",
    red: 20,
    green: 40,
    blue: 160
  });

  let handle: WindowHandle | undefined = $state();
  let menuAt = $state<ScreenPoint | null>(null);
  let markupMenuAt = $state<ScreenPoint | null>(null);
  let builtFlyout: MenuFlyout | null = null;
  let picked = "";

  const items = defineMenu([
    {
      kind: MenuItemKind.HEADER,
      id: "title",
      label: "Recorder"
    },
    {
      kind: MenuItemKind.COMMAND,
      id: "open",
      label: "Open",
      shortcut: "Ctrl+O",
      badge: "3",
      icon: "",
      onselect() {
        picked = "open";
      }
    },
    {
      kind: MenuItemKind.CHECK,
      id: "autostart",
      label: "Start with Windows",
      isChecked: true,
      staysOpen: true
    },
    {
      kind: MenuItemKind.SEPARATOR,
      id: "divider"
    },
    {
      kind: MenuItemKind.RADIO,
      id: "fast",
      label: "Fast",
      group: "speed",
      isChecked: true
    },
    {
      kind: MenuItemKind.RADIO,
      id: "slow",
      label: "Slow",
      group: "speed"
    },
    {
      kind: MenuItemKind.SUBMENU,
      id: "capture",
      label: "Capture",
      items: [
        {
          kind: MenuItemKind.COMMAND,
          id: "region",
          label: "Region",
          isBold: true
        },
        {
          kind: MenuItemKind.SUBMENU,
          id: "deep",
          label: "More",
          items: [{
            kind: MenuItemKind.COMMAND,
            id: "scroll",
            label: "Scrolling",
            isEnabled: false
          }]
        }
      ]
    },
    {
      kind: MenuItemKind.COMMAND,
      id: "full",
      label: "Only at the full level",
      level: MenuLevel.FULL
    },
    {
      kind: MenuItemKind.COMMAND,
      id: "quit",
      label: "Quit",
      isRequired: true
    }
  ]);

  const commands = new Map<string, (command: ExampleCommand) => void>([
    ["info", () => report("info")],
    ["open", command => {
      menuAt = {
        x: Number(command["x"]),
        y: Number(command["y"])
      };
      report("open");
    }],
    ["markupOpen", command => {
      markupMenuAt = {
        x: Number(command["x"]),
        y: Number(command["y"])
      };
      report("markupOpen");
    }],
    ["menuClose", () => {
      builtFlyout = null;
      menuAt = null;
      markupMenuAt = null;
      report("menuClose");
    }],
    ["close", () => handle?.close()]
  ]);

  function report(kind: string) {
    flush();
    host.report({
      kind,
      isMenuOpen: menuAt !== null,
      isMarkupMenuOpen: markupMenuAt !== null,
      flyout: builtFlyout === null ? [] : describeFlyout(builtFlyout),
      picked
    });
  }

  // svelte-ignore state_referenced_locally
  host.onCommand(command => commands.get(String(command["cmd"]))?.(command));
</script>

<Window
  height={WINDOW_HEIGHT}
  onclosed={() => exitApplication()}
  title="Tray menu example"
  width={WINDOW_WIDTH}
  bind:handle
>
  <stack-panel>
    <text-block>The tray menu is read from markup in this window too.</text-block>
    <TrayMenu>
      <TrayMenuItem id="inside" label="Inside the window" />
      <TrayMenuSubmenu id="inside-more" label="More">
        <TrayMenuItem id="inside-one" label="One" />
      </TrayMenuSubmenu>
    </TrayMenu>
  </stack-panel>
</Window>

<TrayIcon
  guid="0d5a7a43-2f5b-4d2c-9e53-0f6b3a1f8c11"
  icon={ICON}
  shouldActivateMenu={false}
  tooltip="Tray menu example"
  bind:menuAt
>
  {#snippet menu({ close })}
    <TrayMenuFlyout
      onclose={close}
      onflyout={flyout => {
        builtFlyout = flyout;
      }}
      resolve={() => resolveMenu({ items })}
    />
  {/snippet}
</TrayIcon>

<TrayIcon
  guid="0d5a7a43-2f5b-4d2c-9e53-0f6b3a1f8c12"
  icon={ICON}
  shouldActivateMenu={false}
  tooltip="Tray menu example, markup"
  bind:menuAt={markupMenuAt}
>
  <TrayMenu>
    <TrayMenuItem id="markup-open" label="Open" />
    <TrayMenuItem id="markup-quit" isRequired label="Quit" />
  </TrayMenu>
</TrayIcon>
