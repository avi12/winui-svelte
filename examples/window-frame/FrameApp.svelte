<script lang="ts">
  import type { ExampleCommand, ExampleHost } from "#examples/harness/contract.ts";
  import type { Json } from "#src/messaging/json.js";
  import { clipSizeOf, ExtendedStyle, hasExtendedStyles, isExcludedFromCapture } from "#src/window/native.js";
  import type { WindowProps } from "#src/window/window-host.svelte.js";
  import { DisplayArea, Grid, projectAs } from "#src/winui.js";
  import { elementSize, flush } from "winui-svelte";
  import { TextBlock, Window } from "winui-svelte/components";
  import type { WindowHandle } from "winui-svelte/components";
  import { hideToTray, restoreFromTray } from "winui-svelte/tray";
  import {
    DockDisplay,
    exitApplication,
    exitWhenHostEnds,
    SizeToContent,
    WindowAnchor
  } from "winui-svelte/window";

  type WindowFrame = Pick<
    WindowProps,
    | "anchor"
    | "cornerRadius"
    | "isActivatable"
    | "isAlwaysOnTop"
    | "isBorderless"
    | "isClickThrough"
    | "isExcludedFromCapture"
    | "isHidden"
    | "isResizable"
    | "isShownInSwitchers"
    | "isToolWindow"
    | "sizeToContent"
  >;

  const { host }: { host: ExampleHost } = $props();

  // The process the test stands in for the host with: when it ends, so does this one.
  function watchHostProcess() {
    const hostProcessId = Number(host.options["host-process"]);
    const hasHostProcess = Number.isInteger(hostProcessId);
    if (hasHostProcess) {
      exitWhenHostEnds({ hostProcessId });
    }
  }

  watchHostProcess();

  // svelte-ignore state_referenced_locally
  let frame = $state<WindowFrame>({ isHidden: host.options["hidden"] === "true" ? true : undefined });
  let handle: WindowHandle | undefined = $state();
  const size = elementSize();
  let isTrayOnClose = false;
  let closeRequests = 0;
  let extraLines = $state(0);
  function extraText() {
    return Array.from({ length: extraLines }, (_, iLine) => `Line ${iLine}`).join("\n");
  }

  function optionalBoolean(value: Json | undefined) {
    return typeof value === "boolean" ? value : undefined;
  }

  function optionalAnchor(value: Json | undefined) {
    return Object.values(WindowAnchor).find(anchor => anchor === value);
  }

  function optionalSizeToContent(value: Json | undefined) {
    return Object.values(SizeToContent).find(mode => mode === value);
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
      presenterKind: presenter.kind,
      bounds: {
        x: appWindow.position.x,
        y: appWindow.position.y,
        width: appWindow.size.width,
        height: appWindow.size.height
      },
      geometry: handle === undefined ? null : {
        outerWidth: handle.geometry.outerWidth,
        outerHeight: handle.geometry.outerHeight,
        screenX: handle.geometry.screenX,
        screenY: handle.geometry.screenY,
        devicePixelRatio: handle.geometry.devicePixelRatio
      }
    };
  }

  function report(kind: string) {
    flush();
    const content = handle?.window.content;
    const isOpen = content !== undefined;
    // A window sized to its content holds its root in a scroll viewer.
    const isContained = frame.sizeToContent !== undefined && frame.sizeToContent !== SizeToContent.none;
    const hasGrid = isOpen && !isContained;
    host.report({
      kind,
      isOpen,
      rowCount: hasGrid ? projectAs(content, Grid).rowDefinitions.size : 0,
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
    const opened = handle;
    const isOpen = opened !== undefined;
    const isHiding = isTrayOnClose && isOpen;
    if (isHiding) {
      hideToTray(opened);
    }

    return isHiding;
  }

  const commands = new Map<string, (command: ExampleCommand) => void>([
    ["info", () => report("info")],
    ["frame", command => {
      frame = {
        anchor: optionalAnchor(command["anchor"]),
        sizeToContent: optionalSizeToContent(command["sizeToContent"]),
        cornerRadius: optionalNumber(command["cornerRadius"]),
        isActivatable: optionalBoolean(command["isActivatable"]),
        isAlwaysOnTop: optionalBoolean(command["isAlwaysOnTop"]),
        isBorderless: optionalBoolean(command["isBorderless"]),
        isClickThrough: optionalBoolean(command["isClickThrough"]),
        isExcludedFromCapture: optionalBoolean(command["isExcludedFromCapture"]),
        isHidden: optionalBoolean(command["isHidden"]),
        isResizable: optionalBoolean(command["isResizable"]),
        isShownInSwitchers: optionalBoolean(command["isShownInSwitchers"]),
        isToolWindow: optionalBoolean(command["isToolWindow"])
      };
      report("frame");
    }],
    ["grow", command => {
      extraLines = optionalNumber(command["lines"]) ?? 0;
      flush();
      report("grown");
    }],
    ["dock", command => {
      handle?.dock({
        anchor: optionalAnchor(command["anchor"]) ?? WindowAnchor.bottomRight,
        inset: optionalNumber(command["inset"]) ?? 0
      });
      report("docked");
    }],
    ["cover", command => {
      const hasRegion = command["region"] !== undefined;
      const bounds = handle?.cover({
        display: DockDisplay.primary,
        ...(hasRegion ? {
          region: {
            x: optionalNumber(command["x"]) ?? 0,
            y: optionalNumber(command["y"]) ?? 0,
            width: optionalNumber(command["width"]) ?? 0,
            height: optionalNumber(command["height"]) ?? 0
          }
        } : {})
      });
      const primary = DisplayArea.primary.outerBounds;
      host.report({
        kind: "covered",
        ...frameReadback(),
        target: bounds ?? null,
        displayBounds: {
          x: primary.x,
          y: primary.y,
          width: primary.width,
          height: primary.height
        },
        clientSize: handle === undefined ? null : {
          width: handle.appWindow.clientSize.width,
          height: handle.appWindow.clientSize.height
        }
      });
    }],
    ["move", command => {
      handle?.geometry.moveBy(optionalNumber(command["x"]) ?? 0, optionalNumber(command["y"]) ?? 0);
      handle?.geometry.resizeBy(optionalNumber(command["width"]) ?? 0, optionalNumber(command["height"]) ?? 0);
      report("moved");
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
      const opened = handle;
      const isOpen = opened !== undefined;
      if (isOpen) {
        restoreFromTray(opened);
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
  activate={false}
  anchor={frame.anchor}
  cornerRadius={frame.cornerRadius}
  isActivatable={frame.isActivatable}
  isAlwaysOnTop={frame.isAlwaysOnTop}
  isBorderless={frame.isBorderless}
  isClickThrough={frame.isClickThrough}
  isExcludedFromCapture={frame.isExcludedFromCapture}
  isHidden={frame.isHidden}
  isResizable={frame.isResizable}
  isShownInSwitchers={frame.isShownInSwitchers}
  isToolWindow={frame.isToolWindow}
  onclosed={() => exitApplication()}
  onclosing={refuseClose}
  sizeToContent={frame.sizeToContent}
  title="Window frame example"
  bind:handle
>
  {#snippet titleBar()}
    <TextBlock>Window frame example</TextBlock>
  {/snippet}
  <grid class="content" {@attach size.attach}>
    <TextBlock>Rows and columns of a grid, with nothing registered by hand.</TextBlock>
    {#if extraLines > 0}
      <text-block grid.row={1}>{extraText()}</text-block>
    {/if}
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
