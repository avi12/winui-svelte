<script lang="ts">
  import { StackPanel, TextBlock } from "winui-svelte/components";
</script>

<StackPanel class="page">
  <TextBlock class="title">Scoped to the instance</TextBlock>
</StackPanel>

<style>
  .page {
    gap: 12px;
  }

  .title {
    font-size: 24px;
  }
</style>
