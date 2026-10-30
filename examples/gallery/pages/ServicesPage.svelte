<script lang="ts">
  import PageFrame from "#examples/gallery/PageFrame.svelte";
  import { onOff } from "#examples/gallery/pages/words.ts";
  import { shell } from "#examples/gallery/shell.svelte.ts";
  import { keyControl } from "#examples/harness/smoke.ts";
  import { notify } from "winui-svelte/app";
  import { Button, StackPanel, TextBlock } from "winui-svelte/components";
  import { PickerLocation, systemSettings } from "winui-svelte/window";

  const settings = systemSettings();
  let picked = $state("nothing picked");
  let notice = $state("no notification yet");

  async function pick() {
    const path = await shell.handle?.pickFile({
      title: "Pick a file",
      startIn: PickerLocation.documents
    });
    picked = path ?? "cancelled";
  }

  async function save() {
    const path = await shell.handle?.saveFile({
      suggestedFileName: "note",
      defaultFileExtension: ".txt",
      fileTypeChoices: {
        text: [".txt"]
      }
    });
    picked = path ?? "cancelled";
  }

  function toast() {
    notice = "asked Windows to show a notification";
    notify({
      title: "winui-svelte",
      body: "Hello from the gallery",
      onInvoked: () => (notice = "the notification was clicked")
    });
  }
</script>

<PageFrame
  caption="What an app asks of Windows besides controls: file dialogs over the window, live system settings and notifications."
  title="App services"
>
  <StackPanel class="services-block">
    <Button {@attach keyControl("services")} onclick={pick}>Pick a file</Button>
    <Button onclick={save}>Save as</Button>
    <TextBlock>{picked}</TextBlock>
    <TextBlock>Accent {settings.accentColor}, text scale {settings.textScaleFactor}</TextBlock>
    <TextBlock>
      Animations {onOff(settings.isAnimationEnabled)}, high contrast {onOff(settings.isHighContrast)}
    </TextBlock>
    <Button onclick={toast}>Notify</Button>
    <TextBlock>{notice}</TextBlock>
  </StackPanel>
</PageFrame>

<style>
  .services-block {
    gap: 8px;
  }
</style>
