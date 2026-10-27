<script lang="ts">
  // Svelte's blocks through a custom renderer, for blocks.test.ts.
  let items = $state(["a", "b", "c"]);
  let isHeaderShown = $state(true);

  export function showItems(next: string[]) {
    items = next;
  }

  export function showHeader(isShown: boolean) {
    isHeaderShown = isShown;
  }
</script>

<stack-panel>
  {#if isHeaderShown}
    <text-block>header</text-block>
  {/if}
  {#each items as item (item)}
    <text-block>{item}</text-block>
  {/each}
  <text-block>footer</text-block>
</stack-panel>
