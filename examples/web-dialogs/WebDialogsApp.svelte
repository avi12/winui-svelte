<script lang="ts">
  import type { ExampleCommand, ExampleHost } from "#examples/harness/contract.ts";
  import { SvelteMap } from "svelte/reactivity";
  import { TextBlock, Window } from "winui-svelte/components";
  import type { WindowHandle } from "winui-svelte/components";
  import { showDialog, useDialogWindow } from "winui-svelte/dialogs";
  import { DialogButton } from "winui-svelte/enums";
  import { exitApplication } from "winui-svelte/window";

  interface Props {
    host: ExampleHost;
  }

  const WINDOW_HEIGHT = 300;
  const WINDOW_WIDTH = 400;

  const { host }: Props = $props();
  const controllers = new SvelteMap<number, AbortController>();
  let handle = $state<WindowHandle>();

  $effect(() => {
    if (!handle) {
      return;
    }

    return useDialogWindow(handle);
  });

  // Shows a dialog under an id and reports how it ended, or why it failed.
  async function show(command: ExampleCommand) {
    const id = Number(command["id"]);
    const controller = new AbortController();
    controllers.set(id, controller);
    try {
      const answer = await showDialog({
        content: `Dialog ${id}`,
        title: "Example",
        primaryButtonText: "Yes",
        closeButtonText: "No",
        defaultButton: DialogButton.PRIMARY,
        ...command["isInput"] === true ? {
          input: {
            value: "start"
          }
        } : {},
        signal: controller.signal
      });
      host.report({
        kind: "settled",
        id,
        result: answer.result
      });
    } catch (error) {
      host.report({
        kind: "settled",
        id,
        error: error instanceof Error ? error.name : String(error)
      });
    }
  }

  const commands = new Map<string, (command: ExampleCommand) => void>([
    ["ping", () => host.report({
      kind: "pong",
      isReady: handle !== undefined
    })],
    ["show", command => {
      void show(command);
    }],
    ["abort", command => controllers.get(Number(command["id"]))?.abort()],
    ["close", () => exitApplication()]
  ]);
  // svelte-ignore state_referenced_locally
  host.onCommand(command => commands.get(String(command["cmd"]))?.(command));
</script>

<Window
  activate={false}
  height={WINDOW_HEIGHT}
  onclosed={exitApplication}
  placement={{
    x: -8000,
    y: 0
  }}
  title="Dialogs example"
  width={WINDOW_WIDTH}
  bind:handle
>
  <TextBlock text="Dialogs" />
</Window>
