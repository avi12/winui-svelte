<script lang="ts">
  import { hotTally } from "./hot-tally.svelte.ts";
  import { Button, StackPanel, TextBlock } from "winui-svelte/components";

  let count = $state(0);
</script>

<StackPanel>
  <TextBlock automationId="hot-label">hot version A count {count} tally {hotTally.value}</TextBlock>
  <Button
    automationId="hot-button"
    onClick={() => {
      count++;
      hotTally.value++;
    }}
  >hot</Button>
</StackPanel>
