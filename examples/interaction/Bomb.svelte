<script lang="ts">
  interface Props {
    isArmed: boolean;
  }

  const props: Props = $props();
  // svelte-ignore state_referenced_locally
  if (props.isArmed) {
    throw new Error("boom");
  }
</script>

<text-block>safe</text-block>
