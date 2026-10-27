<script lang="ts">
  import type { ExampleCommand, ExampleHost } from "#examples/harness/contract.ts";
  import type { Json } from "#src/messaging/json.js";
  import { DesktopAcrylicBackdrop, MicaBackdrop, MicaKind, projectAs } from "#src/winui.js";
  import { flush } from "winui-svelte";
  import { Window } from "winui-svelte/components";
  import type { WindowBounds, WindowHandle } from "winui-svelte/components";
  import { exitApplication } from "winui-svelte/window";
  import { Backdrop } from "winui-svelte/window";

  const WINDOW_WIDTH = 520;
  const WINDOW_HEIGHT = 360;
  const WINDOW_MIN_WIDTH = 400;

  // The material named, or acrylic.
  function backdropOf(name: Json | undefined) {
    return Object.values(Backdrop).find(candidate => candidate === name) ?? Backdrop.Acrylic;
  }

  // The host is the harness's, handed over once: it never changes.
  const { host }: { host: ExampleHost } = $props();

  // svelte-ignore state_referenced_locally
  let backdrop = $state(backdropOf(host.options["backdrop"]));
  let title = $state("Window example");
  let width = $state(WINDOW_WIDTH);
  let handle: WindowHandle | undefined = $state();
  let lastBounds: WindowBounds | null = null;
  let boundsReports = 0;
  let activations = 0;
  let closes = 0;

  // The kind of material the window holds now, read back from WinUI.
  function backdropName() {
    const held = handle?.window.systemBackdrop;
    const isUnset = held === undefined || held === null;
    if (isUnset) {
      return "none";
    }

    // WinUI hands back the base class; projecting to the wrong one throws.
    try {
      return projectAs(held, MicaBackdrop).kind === MicaKind.BaseAlt ? "micaAlt" : "mica";
    } catch {
      return projectAs(held, DesktopAcrylicBackdrop) instanceof DesktopAcrylicBackdrop ? "acrylic" : "unknown";
    }
  }

  // Reports what the window shows after the props the command changed have
  // reached it.
  function report(kind: string) {
    flush();
    const appWindow = handle?.appWindow;
    host.report({
      kind,
      backdrop: backdropName(),
      title: handle?.window.title,
      scale: handle?.scale,
      extendsIntoTitleBar: handle?.window.extendsContentIntoTitleBar,
      width: appWindow?.size.width,
      height: appWindow?.size.height,
      x: appWindow?.position.x,
      y: appWindow?.position.y,
      minimumWidth: handle?.presenter.preferredMinimumWidth,
      isMaximizable: handle?.presenter.isMaximizable,
      boundsReports,
      lastBounds,
      activations,
      closes
    });
  }

  const commands = new Map<string, (command: ExampleCommand) => void>([
    ["info", () => report("info")],
    ["backdrop", command => {
      backdrop = backdropOf(command["value"]);
      report("backdrop");
    }],
    ["title", command => {
      title = String(command["value"]);
      report("title");
    }],
    ["width", command => {
      width = Number(command["value"]);
      report("width");
    }],
    ["move", command => {
      handle?.appWindow.move({
        x: Number(command["x"]),
        y: Number(command["y"])
      });
      report("moved");
    }],
    ["close", () => handle?.close()]
  ]);
  // svelte-ignore state_referenced_locally
  host.onCommand(command => commands.get(String(command["cmd"]))?.(command));
</script>

<Window
  activate={false}
  appUserModelId="winui-svelte.examples.window"
  {backdrop}
  height={WINDOW_HEIGHT}
  isMaximizable={false}
  minWidth={WINDOW_MIN_WIDTH}
  onActiveChanged={isActive => {
    if (isActive) {
      activations++;
    }
  }}
  onBoundsChanged={bounds => {
    boundsReports++;
    lastBounds = bounds;
  }}
  onClosed={() => {
    closes++;
    exitApplication();
  }}
  placement={{
    x: -8000,
    y: 0
  }}
  {title}
  {width}
  bind:handle
>
  {#snippet titleBar()}
    <stack-panel class="title-bar">
      <text-block class="title">{title}</text-block>
    </stack-panel>
  {/snippet}
  <stack-panel class="content">
    <text-block class="heading">Backdrop: {backdrop}</text-block>
    <text-block>The content runs into the title bar; the backdrop shows through.</text-block>
  </stack-panel>
</Window>

<style>
  .title-bar {
    flex-direction: row;
    gap: 10px;
    height: 40px;
    padding: 0 0 0 14px;
  }

  .title {
    align-self: center;
  }

  .content {
    gap: 8px;
    padding: 24px;
  }

  .heading {
    font-size: 20px;
  }
</style>
