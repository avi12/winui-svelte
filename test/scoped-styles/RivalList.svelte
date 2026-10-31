<script lang="ts">
  import type { ListViewBase } from "#winui/microsoft/ui/xaml/controls/ListViewBase";
  import { ListView } from "winui-svelte/components";

  interface Props {
    oncontrol(control: ListViewBase): void;
  }

  const { oncontrol }: Props = $props();
</script>

{#snippet cell(text: string)}
  <text-block>{text}</text-block>
{/snippet}

<ListView
  item={cell}
  itemContainerStyle="row"
  itemName={text => text}
  items={["rival"]}
  key={text => text}
  {oncontrol}
/>

<style>
  .row {
    min-height: 50px;
    padding: 5px;
  }
</style>
