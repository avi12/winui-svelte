<script lang="ts">
  import type { ExampleCommand, ExampleHost } from "#examples/harness/contract.ts";
  import type { Json } from "#src/messaging/json.js";
  import { clipSizeOf, ExtendedStyle, hasExtendedStyles, isExcludedFromCapture } from "#src/window/native.js";
  import type { WindowProps } from "#src/window/window-host.svelte.js";
  import { Grid, projectAs } from "#src/winui.js";
  import { elementSize, flush } from "winui-svelte";
  import { TextBlock, Window } from "winui-svelte/components";
  import type { WindowHandle } from "winui-svelte/components";
  import { hideToTray, restoreFromTray } from "winui-svelte/tray";
  import { exitApplication } from "winui-svelte/window";

  type WindowFrame = Pick<
    WindowProps,
    | "cornerRadius"
    | "isActivatable"
    | "isAlwaysOnTop"
    | "isBorderless"
    | "isClickThrough"
    | "isExcludedFromCapture"
    | "isHidden"
    | "isShownInSwitchers"
    | "isToolWindow"
  >;

  const { host }: { host: ExampleHost } = $props();

  // svelte-ignore state_referenced_locally
  let frame = $state<WindowFrame>({ isHidden: host.options["hidden"] === "true" ? true : undefined });
  let handle: WindowHandle | undefined = $state();
  const size = elementSize();
  let isTrayOnClose = false;
  let closeRequests = 0;

  function optionalBoolean(value: Json | undefined) {
    return typeof value === "boolean" ? value : undefined;
  }

  function optionalNumber(value: Json | undefined) {
    return typeof value === "number" ? value : undefined;
  }

  // What Windows and WinUI hold for the window's frame, read back.
  function frameReadback() {
    const appWindow = handle?.appWindow;
    const isOpen = appWindow !== undefined;
    if (!isOpen) {
      return {};
    }

    const hwnd = appWindow.id.value;
    const { presenter } = appWindow;
    const overlapped = handle?.presenter;
    return {
      isToolWindow: hasExtendedStyles({
        hwnd,
        styles: ExtendedStyle.toolWindow
      }),
      isNoActivate: hasExtendedStyles({
        hwnd,
        styles: ExtendedStyle.noActivate
      }),
      isTransparent: hasExtendedStyles({
        hwnd,
        styles: ExtendedStyle.transparent
      }),
      isLayered: hasExtendedStyles({
        hwnd,
        styles: ExtendedStyle.layered
      }),
      isExcludedFromCapture: isExcludedFromCapture(hwnd),
      clipSize: clipSizeOf(hwnd),
      hasBorder: overlapped?.hasBorder,
      hasTitleBar: overlapped?.hasTitleBar,
      isAlwaysOnTop: overlapped?.isAlwaysOnTop,
      presenterKind: presenter.kind
    };
  }

  function report(kind: string) {
    flush();
    const content = handle?.window.content;
    const isOpen = content !== undefined;
    host.report({
      kind,
      isOpen,
      rowCount: isOpen ? projectAs(content, Grid).rowDefinitions.size : 0,
      isVisible: handle?.appWindow.isVisible,
      scale: handle?.scale,
      elementHeight: size.height,
      desiredHeight: size.desiredHeight,
      ...frameReadback(),
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
    ["frame", command => {
      frame = {
        cornerRadius: optionalNumber(command["cornerRadius"]),
        isActivatable: optionalBoolean(command["isActivatable"]),
        isAlwaysOnTop: optionalBoolean(command["isAlwaysOnTop"]),
        isBorderless: optionalBoolean(command["isBorderless"]),
        isClickThrough: optionalBoolean(command["isClickThrough"]),
        isExcludedFromCapture: optionalBoolean(command["isExcludedFromCapture"]),
        isHidden: optionalBoolean(command["isHidden"]),
        isShownInSwitchers: optionalBoolean(command["isShownInSwitchers"]),
        isToolWindow: optionalBoolean(command["isToolWindow"])
      };
      report("frame");
    }],
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
  {...frame}
  activate={false}
  onclosed={() => exitApplication()}
  onclosing={refuseClose}
  title="Window frame example"
  bind:handle
>
  {#snippet titleBar()}
    <TextBlock>Window frame example</TextBlock>
  {/snippet}
  <grid class="content" {@attach size.attach}>
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
