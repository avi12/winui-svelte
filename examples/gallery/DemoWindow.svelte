<script lang="ts">
  import { StackPanel, TextBlock } from "winui-svelte/components";

  interface Props {
    message: string;
  }

  const props: Props = $props();
</script>

<StackPanel class="demo-window">
  <TextBlock>{props.message}</TextBlock>
  <TextBlock>A second window made with createWindow.</TextBlock>
</StackPanel>

<style>
  .demo-window {
    gap: 8px;
    padding: 24px;
  }
</style>
