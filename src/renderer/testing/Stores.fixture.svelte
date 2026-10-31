<script lang="ts">
  import StoreField from "./StoreField.fixture.svelte";
  import { getContext, setContext } from "svelte";
  import type { Readable, Writable } from "svelte/store";

  interface Props {
    count: Writable<number>;
    double: Readable<number>;
    name: Writable<string>;
    items: Writable<string[]>;
    isShown: Writable<boolean>;
  }

  const { count, double, name, items, isShown }: Props = $props();
  // svelte-ignore state_referenced_locally
  setContext("count", count);
  const inherited = getContext<Writable<number>>("count");
</script>

<fake-panel>
  <text-block>{$count}</text-block>
  <text-block>{$double}</text-block>
  <text-block>{$inherited}</text-block>
  <!-- svelte-ignore a11y_no_static_element_interactions, a11y_click_events_have_key_events -->
  <fake-button onclick={() => $count = 10}></fake-button>
  <!-- svelte-ignore a11y_no_static_element_interactions, a11y_click_events_have_key_events -->
  <fake-button onclick={() => count.update(value => value + 1)}></fake-button>
  <StoreField bind:value={$name} />
  <text-block>{$name}</text-block>
  {#each $items as item (item)}
    <text-block>{item}</text-block>
  {/each}
  {#if $isShown}
    <text-block>shown</text-block>
  {/if}
</fake-panel>
