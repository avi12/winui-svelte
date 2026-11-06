<script lang="ts">
  import type { StackPanel as StackPanelControl } from "#winui/microsoft/ui/xaml/controls/StackPanel";
  import type { ElementRef } from "winui-svelte";
  import {
    Button,
    FontIcon,
    StackPanel,
    TextBlock,
    TextBox
  } from "winui-svelte/components";

  // One small form twice: with the accessibility problems the audit finds
  // (an input with no label, an icon-only button with no name, pale text),
  // and fixed (a header, an automationName, a darker foreground).
  interface Props {
    isFixed: boolean;
    root: ElementRef<StackPanelControl>;
  }

  const props: Props = $props();
</script>

<StackPanel
  class="demo-form"
  {@attach props.root.attach}
  background="#ffffff"
  requestedTheme="Light"
>
  {#if props.isFixed}
    <TextBox header="Email" />
    <Button automationName="Save"><FontIcon glyph="Save" /></Button>
    <TextBlock foreground="#595959">Saved to your account</TextBlock>
  {:else}
    <TextBox />
    <Button><FontIcon glyph="Save" /></Button>
    <TextBlock foreground="#b0b0b0">Saved to your account</TextBlock>
  {/if}
</StackPanel>

<style>
  .demo-form {
    gap: 8px;
    padding: 12px;
  }
</style>
