<script lang="ts">
  import type { ExampleCommand, ExampleHost } from "#examples/harness/contract.ts";
  import { flush } from "winui-svelte";
  import { Border, Window } from "winui-svelte/components";
  import type { WindowHandle } from "winui-svelte/components";
  import { Backdrop, exitApplication } from "winui-svelte/window";

  const CARD_WIDTH = 200;
  const CARD_HEIGHT = 100;
  const CARD_RADIUS = 12;
  const WINDOW_WIDTH = 400;
  const WINDOW_HEIGHT = 300;

  const { host }: { host: ExampleHost } = $props();

  // `--backdrop none` gives the same window the theme's solid color, which the
  // test compares the transparent one with
  const BACKDROP = Object.values(Backdrop).find(kind => kind === host.options["backdrop"]) ?? Backdrop.transparent;

  let handle: WindowHandle | undefined = $state();

  function numberOf(value: unknown) {
    return typeof value === "number" ? value : 0;
  }

  function place(command: ExampleCommand) {
    const appWindow = handle?.appWindow;
    const presenter = handle?.presenter;
    const isOpen = appWindow !== undefined && presenter !== undefined;
    if (!isOpen) {
      return;
    }

    appWindow.hide();
    appWindow.moveAndResize({
      x: numberOf(command["x"]),
      y: numberOf(command["y"]),
      width: numberOf(command["width"]),
      height: numberOf(command["height"])
    });
    appWindow.show(false);
    // Off and on again, so that the window is put above one the test opened
    // since: it is never activated, which is when WinUI would do it
    presenter.isAlwaysOnTop = false;
    presenter.isAlwaysOnTop = true;
  }

  function report(kind: string) {
    const appWindow = handle?.appWindow;
    const isOpen = appWindow !== undefined;
    if (!isOpen) {
      host.report({
        kind,
        isOpen
      });
      return;
    }

    host.report({
      kind,
      isOpen: true,
      isVisible: appWindow.isVisible,
      bounds: {
        x: appWindow.position.x,
        y: appWindow.position.y,
        width: appWindow.size.width,
        height: appWindow.size.height
      }
    });
  }

  const commands = new Map<string, (command: ExampleCommand) => void>([
    ["place", place],
    ["close", exitApplication]
  ]);

  // svelte-ignore state_referenced_locally
  host.onCommand(command => {
    flush();
    commands.get(String(command["cmd"]))?.(command);
    const isClosing = command["cmd"] === "close";
    if (!isClosing) {
      report(String(command["cmd"]));
    }
  });
</script>

<!--
  The card is the only thing the window draws: with a transparent backdrop the
  desktop shows through everything else, with `--backdrop none` it does not
-->
<Window
  activate={false}
  backdrop={BACKDROP}
  height={WINDOW_HEIGHT}
  isActivatable={false}
  isAlwaysOnTop
  isBorderless
  isResizable={false}
  isToolWindow
  onclosed={exitApplication}
  title="Transparent window"
  width={WINDOW_WIDTH}
  bind:handle
>
  <Border
    background="#e61f1f1f"
    cornerRadius={CARD_RADIUS}
    height={CARD_HEIGHT}
    horizontalAlignment="Center"
    verticalAlignment="Center"
    width={CARD_WIDTH}
  />
</Window>
