<script lang="ts">
  import { ToggleSwitch } from "winui-svelte/components";

  let isOn = $state(true);
</script>

<stack-panel class="hello">
  <text-block class="title">Hello from WinUI</text-block>
  <ToggleSwitch header="Lights" bind:isOn />
  <text-block>
    {#if isOn}
      The lights are on
    {:else}
      The lights are off
    {/if}
  </text-block>
</stack-panel>

<style>
  .hello {
    gap: 12px;
    padding: 24px;
  }

  .title {
    font-size: 24px;
  }
</style>
