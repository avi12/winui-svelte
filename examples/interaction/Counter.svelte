<script lang="ts">
  import { note } from "./probe.ts";
  import { Button } from "winui-svelte/components";

  let count = $state(0);
  note("counter:created");
</script>

<Button automationId="keyed-button" onclick={() => count++}>keyed {count}</Button>
