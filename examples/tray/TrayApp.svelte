<script lang="ts">
  import { writeIconFile } from "./icon-file.ts";
  import type { ExampleCommand, ExampleHost } from "#examples/harness/contract.ts";
  import { flush } from "winui-svelte";
  import { Window } from "winui-svelte/components";
  import type { WindowHandle } from "winui-svelte/components";
  import { hideToTray, restoreFromTray, TrayIcon } from "winui-svelte/tray";
  import type { TrayIconHandle } from "winui-svelte/tray";
  import { exitApplication } from "winui-svelte/window";

  const LIGHT_GLYPH = 240;
  const WINDOW_WIDTH = 360;
  const WINDOW_HEIGHT = 240;
  const GUID = "6f1d3c52-8c1a-4a55-9d0e-7b2f4e9a1c03";
  const ICON_FOR_LIGHT_TASKBAR = writeIconFile({
    name: "for-light",
    red: 20,
    green: 40,
    blue: 160
  });
  const ICON_FOR_DARK_TASKBAR = writeIconFile({
    name: "for-dark",
    red: LIGHT_GLYPH,
    green: LIGHT_GLYPH,
    blue: 255
  });

  const { host }: { host: ExampleHost } = $props();

  let tooltip = $state("Tray example");
  let isVisible = $state(true);
  let tray: TrayIconHandle | undefined = $state();
  let handle: WindowHandle | undefined = $state();
  let clicks = 0;
  let contextMenus = 0;

  function requireWindow() {
    const current = handle;
    const isOpen = current !== undefined;
    if (!isOpen) {
      throw new Error("the window has not opened");
    }

    return current;
  }

  // What the shell says about the icon, asked now.
  function report(kind: string) {
    flush();
    const bounds = tray?.bounds() ?? null;
    host.report({
      kind,
      isRegistered: tray?.isRegistered,
      hasBounds: bounds !== null,
      width: bounds === null ? 0 : bounds.right - bounds.left,
      tooltip,
      isWindowVisible: handle?.appWindow.isVisible,
      isShownInSwitchers: handle?.appWindow.isShownInSwitchers,
      clicks,
      contextMenus
    });
  }

  const commands = new Map<string, (command: ExampleCommand) => void>([
    ["info", () => report("info")],
    ["tooltip", command => {
      tooltip = String(command["value"]);
      report("tooltip");
    }],
    ["visible", command => {
      isVisible = command["value"] === true;
      report("visible");
    }],
    ["balloon", () => {
      tray?.notify({
        title: "Tray example",
        body: "A balloon",
        isSilent: true
      });
      report("balloon");
    }],
    ["hideToTray", () => {
      hideToTray(requireWindow());

      report("hideToTray");
    }],
    ["restore", () => {
      restoreFromTray(requireWindow());

      report("restore");
    }],
    ["remove", () => {
      tray?.remove();
      report("remove");
    }],
    ["close", () => handle?.close()]
  ]);
  // svelte-ignore state_referenced_locally
  host.onCommand(command => commands.get(String(command["cmd"]))?.(command));
</script>

<Window
  activate={false}
  appUserModelId="winui-svelte.examples.tray"
  height={WINDOW_HEIGHT}
  onClosed={() => exitApplication()}
  placement={{
    x: -8000,
    y: 0
  }}
  title="Tray example"
  width={WINDOW_WIDTH}
  bind:handle
>
  <stack-panel class="content">
    <text-block>The tray icon shows while this runs.</text-block>
  </stack-panel>
</Window>

<TrayIcon
  guid={GUID}
  icon={{
    forLightTaskbar: ICON_FOR_LIGHT_TASKBAR,
    forDarkTaskbar: ICON_FOR_DARK_TASKBAR
  }}
  {isVisible}
  onclick={() => {
    clicks++;
  }}
  oncontextmenu={() => {
    contextMenus++;
  }}
  {tooltip}
  bind:handle={tray}
/>

<style>
  .content {
    padding: 24px;
  }
</style>
