<script lang="ts">
  import PageFrame from "#examples/gallery/PageFrame.svelte";
  import { keyControl } from "#examples/harness/smoke.ts";
  import { Button, StackPanel, TextBlock } from "winui-svelte/components";
  import type { DragEvent, NativeFile } from "winui-svelte/data-transfer";
  import {
    clipboard,
    draggable,
    dropzone,
    enableDragEvents,
    filePicker,
    launchUri,
    revealInExplorer
  } from "winui-svelte/data-transfer";

  enableDragEvents();

  const BUTTON_SPACING = 8;

  let isOver = $state(false);
  let received = $state("Nothing dropped yet");
  let picked = $state("Nothing picked yet");
  let pasted = $state("The clipboard is untouched");
  let dragEnded = $state("");

  function describe(files: readonly NativeFile[]) {
    return files.map(file => `${file.name} (${file.kind}, ${file.size} bytes)`).join(", ");
  }

  function drop(event: DragEvent) {
    const { files } = event.dataTransfer;
    const text = event.dataTransfer.getData("text/plain");
    received = files.length > 0 ? describe(files) : `Text: ${text}`;
  }

  async function copyAndRead() {
    await clipboard.writeText("Written by the gallery");
    pasted = `Read back: ${await clipboard.readText()}`;
  }
</script>

<PageFrame
  caption="Drag files onto the box, drag the text out to another app, pick files with a dialog, and use the clipboard. The events are the web's: ondragover, ondrop, ondragstart."
  title="Data transfer"
>
  <border
    class="drop-box"
    class:drag-over={isOver}
    {@attach keyControl("data-transfer")}
    {@attach dropzone({
      accept: [".png", ".jpg", "image/*", "text/plain", "directory"],
      onDragStateChange: isEntering => (isOver = isEntering),
      onDrop: drop
    })}
  >
    <text-block text="Drop images, folders or text here"></text-block>
  </border>
  <TextBlock>{received}</TextBlock>

  <!-- svelte-ignore a11y_no_static_element_interactions -->
  <border
    class="drop-box"
    ondragover={(event: DragEvent) => {
      event.preventDefault();
      event.dataTransfer.dropEffect = "link";
    }}
    ondrop={(event: DragEvent) => (received = `Linked: ${describe(event.dataTransfer.files)}`)}
  >
    <text-block text="A raw element with ondragover and ondrop"></text-block>
  </border>

  <TextBlock
    {@attach draggable({
      text: "Dragged out of the gallery",
      effectAllowed: "copy",
      onDragEnd: (event: DragEvent) => (dragEnded = `Drag ended: ${event.dataTransfer.dropEffect}`)
    })}
  >
    Drag this text to Notepad
  </TextBlock>
  <TextBlock>{dragEnded}</TextBlock>

  <Button
    {@attach filePicker({
      accept: ".png,image/jpeg",
      multiple: true,
      onPick: (files: NativeFile[]) => (picked = describe(files))
    })}
  >
    Choose pictures
  </Button>
  <TextBlock>{picked}</TextBlock>

  <StackPanel orientation="Horizontal" spacing={BUTTON_SPACING}>
    <Button onclick={copyAndRead}>Copy text and read it back</Button>
    <Button onclick={() => launchUri("https://github.com/avi12/winui-svelte")}>Open the repository</Button>
    <Button onclick={() => revealInExplorer(import.meta.filename)}>Show this page in Explorer</Button>
  </StackPanel>
  <TextBlock>{pasted}</TextBlock>
</PageFrame>

<style>
  .drop-box {
    padding: 24px;
    border: 2px dashed #808080;
  }

  .drag-over {
    border-color: rgb(0 120 212);
    background: rgb(0 120 212 / 20%);
  }
</style>
