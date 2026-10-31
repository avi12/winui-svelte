<script lang="ts">
  interface Props {
    value: string;
  }

  let { value = $bindable() }: Props = $props();
</script>

<!-- svelte-ignore a11y_no_static_element_interactions, a11y_click_events_have_key_events -->
<fake-field onclick={() => value = "typed"}>{value}</fake-field>
