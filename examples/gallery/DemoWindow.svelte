<script lang="ts">
  import { StackPanel, TextBlock } from "winui-svelte/components";

  interface Props {
    message: string;
  }

  const { message }: Props = $props();
</script>

<StackPanel class="demo-window">
  <TextBlock text={message} />
  <TextBlock text="A second window made with createWindow." />
</StackPanel>

<style>
  :global(.demo-window) {
    gap: 8px;
    padding: 24px;
  }
</style>
