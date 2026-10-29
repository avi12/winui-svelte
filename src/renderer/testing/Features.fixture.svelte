<script lang="ts">
  import Child from "./FeaturesChild.fixture.svelte";
  import { onMount, setContext } from "svelte";

  interface Props {
    log: (line: string) => void;
  }

  const { log }: Props = $props();
  let count = $state(0);
  let items = $state(["a", "b", "c"]);
  let tag = $state("text-block");
  let hasChild = $state(true);
  let key = $state(0);
  let isHot = $state(false);
  let promise = $state(Promise.resolve("done"));
  setContext("theme", "dark");

  $effect(() => {
    log(`effect:count=${count}`);
  });

  function doubled() {
    return count * 2;
  }

  onMount(() => {
    log("mounted");
    return () => log("unmounted");
  });

  export const api = {
    set(next: Partial<{
      count: number;
      items: string[];
      tag: string;
      hasChild: boolean;
      key: number;
      isHot: boolean;
      promise: Promise<string>;
    }>) {
      count = next.count ?? count;
      items = next.items ?? items;
      tag = next.tag ?? tag;
      hasChild = next.hasChild ?? hasChild;
      key = next.key ?? key;
      isHot = next.isHot ?? isHot;
      promise = next.promise ?? promise;
    },
    doubled
  };

  function attachLog(_node: unknown) {
    log("attach");
    return () => log("detach");
  }
  // eslint-disable-next-line no-restricted-syntax -- Svelte's action signature is (node, parameter)
  function useLog(_node: unknown, parameter: string) {
    log(`use:${parameter}`);
    return { destroy: () => log("use-destroy") };
  }
</script>

{#snippet label(value: string)}
  <text-block>{value}!</text-block>
{/snippet}

<stack-panel>
  <!-- svelte-ignore a11y_no_static_element_interactions, a11y_click_events_have_key_events -->
  <button-control
    onclick={(sender: unknown, args: unknown) => {
      count++; log(`click:${typeof sender}:${typeof args}`);
    }}></button-control>
  <text-block style:margin="3px" style:opacity={isHot ? "1" : "0.5"} class="a" class:cold={!isHot} class:hot={isHot}>{doubled()}</text-block>
  <text-block class={["x", isHot && "y", { z: isHot }]}>arr</text-block>
  <text-block {@attach attachLog} use:useLog={"p"}>att</text-block>
  <svelte:element this={tag}>dyn</svelte:element>
  {#each items as item, i (item)}
    <text-block>{item}{i}</text-block>
  {/each}
  {#key key}
    <text-block>key{key}</text-block>
  {/key}
  {#await promise}
    <text-block>pending</text-block>
  {:then value}
    <text-block>then:{value}</text-block>
  {:catch error}
    <text-block>catch:{error}</text-block>
  {/await}
  {@render label("snip")}
  {#if hasChild}
    <Child />
  {/if}
  <svelte:boundary>
    {#if isHot && count > 100}
      {(() => {
        throw new Error("boom");
      })()}
    {/if}
    <text-block>ok</text-block>
    {#snippet failed(error)}
      <text-block>failed</text-block>
    {/snippet}
  </svelte:boundary>
</stack-panel>
