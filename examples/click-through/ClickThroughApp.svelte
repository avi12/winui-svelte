<script lang="ts">
  import type { ExampleCommand, ExampleHost } from "#examples/harness/contract.ts";
  import { flush } from "winui-svelte";
  import { Border, Window } from "winui-svelte/components";
  import type { WindowHandle } from "winui-svelte/components";
  import { Backdrop, exitApplication } from "winui-svelte/window";

  const RING_THICKNESS = 3;
  const RING_COLOR = "#ffff0000";
  const WINDOW_WIDTH = 400;
  const WINDOW_HEIGHT = 300;

  const { host }: { host: ExampleHost } = $props();

  // `--view blocking` is the control: the same ring without isClickThrough
  // svelte-ignore state_referenced_locally
  const IS_CLICK_THROUGH = host.options["view"] !== "blocking";

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
  A 3 px ring drawn by content and a clear middle, in a transparent, borderless
  window that lets clicks pass: the share border of a screen-sharing app
  (test/click-through.test.ts asks Windows who a click on the ring and in the
  hole would reach, and reads the screen for the ring and the desktop)
-->
<Window
  activate={false}
  backdrop={Backdrop.transparent}
  height={WINDOW_HEIGHT}
  isActivatable={false}
  isAlwaysOnTop
  isBorderless
  isClickThrough={IS_CLICK_THROUGH}
  isResizable={false}
  isToolWindow
  onclosed={exitApplication}
  title="Click through"
  width={WINDOW_WIDTH}
  bind:handle
>
  <Border
    borderBrush={RING_COLOR}
    borderThickness={RING_THICKNESS}
    horizontalAlignment="Stretch"
    verticalAlignment="Stretch"
  />
</Window>
