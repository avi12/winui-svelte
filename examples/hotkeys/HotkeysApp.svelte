<script lang="ts">
  import { postHotkey } from "./native.ts";
  import type { ExampleCommand, ExampleHost } from "#examples/harness/contract.ts";
  import { flush } from "winui-svelte";
  import { registerHotkey } from "winui-svelte/app/hotkeys";
  import type { Hotkey } from "winui-svelte/app/hotkeys";
  import { StackPanel, TextBlock, Window } from "winui-svelte/components";
  import type { WindowHandle } from "winui-svelte/components";
  import { toggleInTray } from "winui-svelte/tray";
  import { exitApplication } from "winui-svelte/window";

  const WINDOW_HEIGHT = 200;
  const WINDOW_WIDTH = 460;
  const DEFAULT_KEYS = "ctrl+alt+shift+f23";

  interface Props {
    // The harness's, handed over once: it never changes.
    host: ExampleHost;
  }

  const { host }: Props = $props();

  let handle: WindowHandle | undefined = $state();
  let hotkey: Hotkey | undefined = $state();
  let presses = $state(0);
  let status = $state("No hotkey yet");

  function register(command: ExampleCommand) {
    const keys = String(command["keys"] ?? DEFAULT_KEYS);
    try {
      hotkey = registerHotkey({
        keys,
        onpressed(event) {
          presses += 1;
          status = `Pressed ${event.keys}`;
          const window = handle;
          const isOpen = window !== undefined;
          if (isOpen) {
            toggleInTray(window);
          }
        }
      });
      status = `Press ${hotkey.keys} to hide or show this window`;
      report("registered");
    } catch (error) {
      host.report({
        kind: "refused",
        name: error instanceof Error ? error.name : "unknown",
        message: String(error)
      });
    }
  }

  function unregister() {
    hotkey?.unregister();
    status = "Unregistered";
    report("unregistered");
  }

  function press() {
    const current = hotkey;
    const isRegistered = current !== undefined;
    if (isRegistered) {
      postHotkey(current.id);
    }
  }

  function report(kind: string) {
    flush();
    host.report({
      kind,
      isRegistered: hotkey?.isRegistered ?? false,
      id: hotkey?.id ?? 0,
      presses,
      isWindowVisible: handle?.appWindow.isVisible ?? false
    });
  }

  const commands = new Map<string, (command: ExampleCommand) => void>([
    ["register", register],
    ["unregister", unregister],
    ["press", press],
    ["state", () => report("state")],
    ["close", () => exitApplication()]
  ]);
  // svelte-ignore state_referenced_locally
  host.onCommand(command => commands.get(String(command["cmd"]))?.(command));
</script>

<Window
  height={WINDOW_HEIGHT}
  onclosed={() => {
    hotkey?.unregister();
    exitApplication();
  }}
  title="Hotkeys example"
  width={WINDOW_WIDTH}
  bind:handle
>
  <StackPanel>
    <TextBlock>{status}</TextBlock>
    <TextBlock>Pressed {presses} times</TextBlock>
  </StackPanel>
</Window>
