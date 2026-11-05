<script lang="ts">
  import { API_KEY_PAGE } from "./pill-view.ts";
  import { send } from "./view.svelte.ts";
  import { projectAs } from "#winui/lifetime";
  import { KeyRoutedEventArgs } from "#winui/microsoft/ui/xaml/input/KeyRoutedEventArgs";
  import {
    Button,
    Hyperlink,
    PasswordBox,
    StackPanel,
    TextBlock
  } from "winui-svelte/components";
  import { VirtualKey } from "winui-svelte/enums";

  let key = $state("");

  // Enter saves and Escape cancels. The press is handed over as the bare
  // WinRT object, so it is read as a KeyRoutedEventArgs (the way the package's
  // own list host reads a key press); `handled` stops the key reaching the
  // control's default handling
  function press(args: object) {
    const event = projectAs(args, KeyRoutedEventArgs);
    const isEnter = event.key === VirtualKey.Enter;
    if (isEnter) {
      event.handled = true;
      send({
        kind: "submitKey",
        key
      });
      return;
    }

    const isEscape = event.key === VirtualKey.Escape;
    if (isEscape) {
      event.handled = true;
      send({ kind: "cancelKey" });
    }
  }
</script>

<StackPanel class="key-panel">
  <TextBlock textWrapping="Wrap">
    Paste a Gemini API key; Enter saves, Esc cancels. Get one at
    <Hyperlink navigateUri={API_KEY_PAGE}>aistudio.google.com/apikey</Hyperlink>
  </TextBlock>
  <PasswordBox
    onkeydown={(_sender, args) => press(args)}
    placeholderText="API key"
    bind:password={key}
  />
  <Button onclick={() => send({ kind: "cancelKey" })}>Cancel</Button>
</StackPanel>

<style>
  .key-panel {
    gap: 8px;
    padding: 12px;
  }
</style>
