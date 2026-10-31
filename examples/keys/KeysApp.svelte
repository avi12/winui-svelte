<script lang="ts">
  import type { ExampleCommand, ExampleHost } from "#examples/harness/contract.ts";
  import { elementRef, focusElement, FocusKind } from "winui-svelte";
  import type { Focusable } from "winui-svelte";
  import {
    Button,
    ContentDialog,
    KeyboardAccelerator,
    StackPanel,
    TextBlock,
    TextBox,
    Window
  } from "winui-svelte/components";
  import type { WindowHandle } from "winui-svelte/components";
  import { VirtualKey, VirtualKeyModifiers } from "winui-svelte/enums";
  import { exitApplication } from "winui-svelte/window";

  const WINDOW_HEIGHT = 420;
  const WINDOW_WIDTH = 480;

  interface Props {
    host: ExampleHost;
  }

  const { host }: Props = $props();

  const first = elementRef<Focusable>();
  const input = elementRef<Focusable>();
  const last = elementRef<Focusable>();
  const openDialog = elementRef<Focusable>();
  const controls = new Map([
    ["first", first],
    ["input", input],
    ["last", last],
    ["open-dialog", openDialog]
  ]);
  let handle = $state<WindowHandle | undefined>();
  let text = $state("");
  let selectionStart = $state(0);
  let selectionLength = $state(0);
  let saves = $state(0);
  let clicks = $state(0);
  let accessInvocations = $state(0);
  let isDialogOpen = $state(false);
  let results = $state<string[]>([]);
  let focusLog = $state<string[]>([]);

  function recordFocus(id: string) {
    return () => {
      focusLog.push(id);
    };
  }

  function focusControl(id: string) {
    const control = controls.get(id)?.current;
    const isReady = control !== undefined;
    if (isReady) {
      focusElement({
        control,
        state: FocusKind.keyboard
      });
    }
  }

  const commands = new Map<string, (command: ExampleCommand) => void>([
    ["activate", () => handle?.activate()],
    ["focus", command => focusControl(String(command["id"]))],
    ["state", () => host.report({
      kind: "state",
      text,
      selectionStart,
      selectionLength,
      saves,
      clicks,
      accessInvocations,
      isDialogOpen,
      results: results.join(","),
      focusLog: focusLog.join(",")
    })],
    ["clearLogs", () => {
      focusLog = [];
      results = [];
    }],
    ["close", () => exitApplication()]
  ]);
  // svelte-ignore state_referenced_locally
  host.onCommand(command => commands.get(String(command["cmd"]))?.(command));
</script>

<Window
  height={WINDOW_HEIGHT}
  onclosed={exitApplication}
  title="Keys example"
  width={WINDOW_WIDTH}
  bind:handle
>
  <StackPanel class="keys">
    <Button
      {@attach first.attach}
      automationId="first"
      onclick={() => clicks++}
      ongotfocus={recordFocus("first")}
    >
      Save
      {#snippet keyboardAccelerators()}
        <KeyboardAccelerator
          key={VirtualKey.S}
          modifiers={VirtualKeyModifiers.Control}
          oninvoked={() => saves++}
        />
      {/snippet}
    </Button>
    <TextBox
      {@attach input.attach}
      automationId="input"
      ongotfocus={recordFocus("input")}
      bind:selectionLength
      bind:selectionStart
      bind:text
    />
    <Button
      {@attach last.attach}
      accessKey="F"
      automationId="last"
      onclick={() => accessInvocations++}
      ongotfocus={recordFocus("last")}
    >
      File
    </Button>
    <Button
      {@attach openDialog.attach}
      automationId="open-dialog"
      onclick={() => (isDialogOpen = true)}
      ongotfocus={recordFocus("open-dialog")}
    >
      Open the dialog
    </Button>
    <TextBlock automationId="status">{results.join(",")}</TextBlock>
    <ContentDialog
      closeButtonText="Cancel"
      defaultButton="Primary"
      onresult={result => results.push(String(result))}
      primaryButtonText="OK"
      title="Confirm"
      bind:open={isDialogOpen}
    >
      Enter presses OK, Escape cancels
    </ContentDialog>
  </StackPanel>
</Window>

<style>
  .keys {
    gap: 8px;
  }
</style>
