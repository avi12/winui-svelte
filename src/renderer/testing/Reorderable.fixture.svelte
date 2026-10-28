<script lang="ts">
  // A keyed {#each} of text blocks in a panel, for host.test.ts: the panel is
  // the kind of control (a tab strip) whose user reorders its children natively.
  interface Props {
    items: string[];
  }

  const props: Props = $props();
</script>

<fake-panel>
  {#each props.items as item (item)}
    <fake-text-block>{item}</fake-text-block>
  {/each}
</fake-panel>
