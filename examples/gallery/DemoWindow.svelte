<script lang="ts">
  import { StackPanel, TextBlock } from "winui-svelte/components";

  interface Props {
    message: string;
  }

  const props: Props = $props();
</script>

<StackPanel class="demo-window">
  <TextBlock text={props.message} />
  <TextBlock text="A second window made with createWindow." />
</StackPanel>

<style>
  :global(.demo-window) {
    gap: 8px;
    padding: 24px;
  }
</style>
