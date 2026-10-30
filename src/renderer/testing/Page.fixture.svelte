<script lang="ts">
  // A page for the navigator tests: it says when it is made and when it ends,
  // and shows its label and a count it keeps in its own state.
  interface Props {
    label: string;
    log: (line: string) => void;
  }

  const props: Props = $props();
  let clicks = $state(0);

  // svelte-ignore state_referenced_locally
  props.log(`made ${props.label}`);
  $effect(() => () => props.log(`ended ${props.label}`));
</script>

<fake-panel>
  <fake-text-block>{props.label} {clicks}</fake-text-block>
  <fake-toggle ontoggled={() => clicks++}></fake-toggle>
</fake-panel>
