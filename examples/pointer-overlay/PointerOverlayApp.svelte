<script lang="ts">
  import type { ExampleCommand, ExampleHost } from "#examples/harness/contract.ts";
  import { Border, Window } from "winui-svelte/components";
  import type { WindowBounds, WindowHandle } from "winui-svelte/components";
  import { enableInputEvents } from "winui-svelte/input";
  import { Backdrop, exitApplication } from "winui-svelte/window";

  const WINDOW_WIDTH = 400;
  const WINDOW_HEIGHT = 300;

  const { host }: { host: ExampleHost } = $props();

  enableInputEvents();

  // `--view=<x>,<y>[,<width>,<height>]` is where the window opens, in device
  // pixels; x and y may be negative, on a display left of the primary one
  function placementOf(view: string | undefined) {
    const [x = 0, y = 0, width = WINDOW_WIDTH, height = WINDOW_HEIGHT] = (view ?? "").split(",").map(Number);
    return {
      x,
      y,
      width,
      height
    };
  }

  // svelte-ignore state_referenced_locally
  const placement = placementOf(host.options["view"]);
  const counts = {
    down: 0,
    move: 0,
    up: 0
  };

  let handle: WindowHandle | undefined = $state();
  let firstBounds: WindowBounds | undefined;
  const commands = new Map<string, (command: ExampleCommand) => void>([
    ["close", exitApplication]
  ]);

  // svelte-ignore state_referenced_locally
  host.onCommand(command => {
    commands.get(String(command["cmd"]))?.(command);
    host.report({
      kind: String(command["cmd"]),
      ...counts,
      bounds: {
        x: handle?.appWindow.position.x,
        y: handle?.appWindow.position.y,
        width: handle?.appWindow.size.width,
        height: handle?.appWindow.size.height
      },
      scale: handle?.scale,
      firstBounds
    });
  });
</script>

<Window
  backdrop={Backdrop.transparent}
  isAlwaysOnTop
  isBorderless
  isToolWindow
  onboundschanged={bounds => {
    firstBounds ??= bounds;
  }}
  onclosed={exitApplication}
  {placement}
  title="Pointer overlay"
  bind:handle
>
  <grid
    onpointerdown={() => {
      counts.down++;
    }}
    onpointermove={() => {
      counts.move++;
    }}
    onpointerup={() => {
      counts.up++;
    }}
    role="presentation"
  >
    <Border background="#40ff0000" />
  </grid>
</Window>
