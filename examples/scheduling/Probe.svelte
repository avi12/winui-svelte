<script lang="ts">
  import { probe } from "./probe-state.svelte.ts";
  import { observe, watch } from "./watch.ts";
  import { TextBlock } from "#winui/microsoft/ui/xaml/controls/TextBlock";
  import { withControl } from "winui-svelte";

  // No flushSync anywhere: the question is who applies the change.
  function click() {
    probe.count += 1;
    watch("click");
  }
</script>

<stack-panel class="probe">
  <text-block
{@attach withControl({
  type: TextBlock,
  use: control => observe(() => control.text)
})}>count={probe.count}</text-block>
  <button onclick={click}>Click via UIA</button>
</stack-panel>

<style>
  .probe {
    gap: 8px;
    padding: 12px;
  }
</style>
