<script lang="ts">
  import { send, view } from "./view.svelte.ts";
  import { Button, StackPanel, TextBlock } from "winui-svelte/components";
</script>

<StackPanel class="extension">
  <Button onclick={() => send({ kind: "connectExtension" })}>Add the browser extension</Button>
  {#if view.isExtensionStepsShown}
    <TextBlock textWrapping="Wrap">
      Open the extensions page, turn on developer mode, then load the folder
    </TextBlock>
  {/if}
</StackPanel>

<style>
  .extension {
    gap: 6px;
  }
</style>
