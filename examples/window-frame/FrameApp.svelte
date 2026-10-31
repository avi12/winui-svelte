<script lang="ts">
  import type { ExampleCommand, ExampleHost } from "#examples/harness/contract.ts";
  import { Grid, projectAs } from "#src/winui.js";
  import { flush } from "winui-svelte";
  import { TextBlock, Window } from "winui-svelte/components";
  import type { WindowHandle } from "winui-svelte/components";
  import { hideToTray, restoreFromTray } from "winui-svelte/tray";
  import { exitApplication } from "winui-svelte/window";

  const { host }: { host: ExampleHost } = $props();

  let handle: WindowHandle | undefined = $state();
  let isTrayOnClose = false;
  let closeRequests = 0;

  function report(kind: string) {
    flush();
    const content = handle?.window.content;
    const isOpen = content !== undefined;
    host.report({
      kind,
      isOpen,
      rowCount: isOpen ? projectAs(content, Grid).rowDefinitions.size : 0,
      isVisible: handle?.appWindow.isVisible,
      closeRequests
    });
  }

  function refuseClose() {
    closeRequests++;
    const isOpen = handle !== undefined;
    const isHiding = isTrayOnClose && isOpen;
    if (isHiding) {
      hideToTray(handle);
    }

    return isHiding;
  }

  const commands = new Map<string, (command: ExampleCommand) => void>([
    ["info", () => report("info")],
    ["trayOnClose", command => {
      isTrayOnClose = command["value"] === true;
      report("trayOnClose");
    }],
    ["tryClose", () => {
      handle?.close();
      report("closeTried");
    }],
    ["restore", () => {
      const isOpen = handle !== undefined;
      if (isOpen) {
        restoreFromTray(handle);
      }

      report("restored");
    }],
    ["close", () => {
      handle?.close();
    }]
  ]);
  // svelte-ignore state_referenced_locally
  host.onCommand(command => commands.get(String(command["cmd"]))?.(command));
</script>

<Window
  onclosed={() => exitApplication()}
  onclosing={refuseClose}
  title="Window frame example"
  bind:handle
>
  {#snippet titleBar()}
    <TextBlock>Window frame example</TextBlock>
  {/snippet}
  <grid class="content">
    <TextBlock>Rows and columns of a grid, with nothing registered by hand.</TextBlock>
  </grid>
</Window>

<style>
  .content {
    display: grid;
    grid-template-rows: auto auto;
    grid-template-columns: 1fr 2fr;
    padding: 12px;
  }
</style>
