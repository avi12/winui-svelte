<script lang="ts">
  import { getContext, onMount } from "svelte";
  const THEME = getContext<string>("theme");
  onMount(() => () => {});
</script>

<text-block>ctx:{THEME}</text-block>
