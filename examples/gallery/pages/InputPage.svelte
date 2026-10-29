<script lang="ts">
  import PageFrame from "#examples/gallery/PageFrame.svelte";
  import { keyControl } from "#examples/harness/smoke.ts";
  import { elementRef, focusElement, FocusKind } from "winui-svelte";
  import type { Focusable } from "winui-svelte";
  import {
    Border,
    Button,
    KeyboardAccelerator,
    StackPanel,
    TextBlock,
    TextBox
  } from "winui-svelte/components";

  const field = elementRef<Focusable>();
  let saves = $state(0);
  let pointer = $state("move over the box");
  let presses = $state(0);

  function focusField() {
    const control = field.current;
    if (control !== undefined) {
      focusElement({
        control,
        state: FocusKind.keyboard
      });
    }
  }
</script>

<PageFrame
  caption="Keyboard accelerators are components inside a control, focus is a call, and pointer events are props."
  title="Input"
>
  <StackPanel class="input-block">
    <Button {@attach keyControl("input")} onClick={() => saves++}>
      Save ({saves})
      {#snippet keyboardAccelerators()}
        <KeyboardAccelerator key="S" modifiers="Control" onInvoked={() => saves++} />
      {/snippet}
    </Button>
    <TextBlock text="Press Ctrl+S, or click the button" />
    <TextBox {@attach field.attach} header="Field" />
    <Button onClick={focusField}>Focus the field</Button>
    <Border
      class="input-pad"
      onPointerEntered={() => (pointer = "entered")}
      onPointerExited={() => (pointer = "left")}
      onPointerPressed={() => presses++}
    >
      <TextBlock text="Pointer: {pointer}, pressed {presses} times" />
    </Border>
  </StackPanel>
</PageFrame>

<style>
  :global(.input-block) {
    gap: 8px;
  }

  :global(.input-pad) {
    padding: 24px;
    background-color: #0a84a8;
  }
</style>
