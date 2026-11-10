<script lang="ts" module>
  // The app's item snippet for keyed-rows.test.ts: its root control is another
  // one when the item changes, as a hot update of a row component makes it.
  export { rowOf };
</script>

{#snippet rowOf(isAlternate: boolean)}
  {#if isAlternate}
    <fake-border></fake-border>
  {:else}
    <fake-panel></fake-panel>
  {/if}
{/snippet}
