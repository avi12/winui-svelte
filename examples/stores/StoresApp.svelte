<script lang="ts">
  import ContextReader from "./ContextReader.svelte";
  import StoreReader from "./StoreReader.svelte";
  import {
    CONTEXT_KEY,
    createMotionStores,
    createStores,
    MOTION_MILLISECONDS,
    SPRING_DAMPING,
    SPRING_STIFFNESS
  } from "./stores.ts";
  import Subscriber from "./Subscriber.svelte";
  import type { ExampleCommand, ExampleHost } from "#examples/harness/contract.ts";
  import { getContext, setContext } from "svelte";
  import { Spring, Tween } from "svelte/motion";
  import {
    createSubscriber,
    MediaQuery,
    SvelteDate,
    SvelteMap,
    SvelteSet
  } from "svelte/reactivity";
  import { get } from "svelte/store";
  import {
    Border,
    Button,
    NumberBox,
    ProgressBar,
    StackPanel,
    TextBlock,
    TextBox,
    ToggleSwitch,
    Window
  } from "winui-svelte/components";
  import { exitApplication } from "winui-svelte/window";

  const WINDOW_HEIGHT = 700;
  const WINDOW_WIDTH = 1300;
  const FULL = 100;
  const WIDE_QUERY = "(min-width: 1px)";
  const STAMP_YEAR = 2030;
  const TEA_PRICE = 3;
  const COFFEE_PRICE = 4;

  interface Props {
    host: ExampleHost;
  }

  const { host }: Props = $props();
  const stores = createStores();
  const { count, double, amount, sum, name, isEnabled, items, clock, stepper } = stores;
  setContext(CONTEXT_KEY, stores.label);
  const contextLabel = getContext<typeof stores.label>(CONTEXT_KEY);

  let isClockShown = $state(false);
  let isSubscriberShown = $state(false);
  let isExternalShown = $state(false);

  const tween = new Tween(0, {
    duration: MOTION_MILLISECONDS
  });
  const physical = new Spring(0, {
    stiffness: SPRING_STIFFNESS,
    damping: SPRING_DAMPING
  });
  const { tweenedStore, springStore } = createMotionStores();
  const prices = new SvelteMap<string, number>();
  const tags = new SvelteSet<string>();
  const stamp = new SvelteDate(0);
  const wide = new MediaQuery(WIDE_QUERY);
  const external = {
    value: 0,
    active: 0,
    update() {}
  };
  const subscribeExternal = createSubscriber(update => {
    external.active++;
    external.update = update;
    return () => {
      external.active--;
    };
  });
  const shown = $derived.by(() => {
    let priceTotal = 0;
    for (const price of prices.values()) {
      priceTotal += price;
    }
    subscribeExternal();
    return {
      opacity: Math.min(1, Math.max(0, physical.current)),
      tween: Math.round(tween.current),
      spring: Math.round(physical.current * FULL),
      tweened: Math.round($tweenedStore),
      springStore: Math.round($springStore * FULL),
      priceTotal,
      external: external.value
    };
  });

  function tallies() {
    return {
      count: stores.count.tally.active,
      clock: stores.clock.tally.active,
      double: stores.double.tally.active,
      sum: stores.sum.tally.active,
      name: stores.name.tally.active,
      items: stores.items.tally.active,
      label: stores.label.tally.active,
      amount: stores.amount.tally.active,
      isEnabled: stores.isEnabled.tally.active,
      external: external.active
    };
  }

  function snapshot(kind: string) {
    host.report({
      kind,
      count: get(count),
      double: get(double),
      sum: get(sum),
      amount: get(amount),
      name: get(name),
      isEnabled: get(isEnabled),
      items: get(items),
      stepper: get(stepper),
      clock: get(clock),
      tween: shown.tween,
      spring: shown.spring,
      tweened: shown.tweened,
      springStore: shown.springStore,
      prices: shown.priceTotal,
      tags: [...tags],
      year: stamp.getFullYear(),
      isWide: wide.current,
      external: shown.external,
      tallies: tallies()
    });
  }

  function moveMotion(target: number) {
    tween.target = target;
    physical.target = target / FULL;
    tweenedStore.set(target);
    springStore.set(target / FULL);
  }

  const commands = new Map<string, (command: ExampleCommand) => void>([
    ["stats", () => snapshot("stats")],
    ["assign", command => {
      $count = Number(command["value"]);
    }],
    ["update", () => count.update(value => value + 1)],
    ["step", () => stepper.increment()],
    ["add", command => items.update(list => [...list, String(command["item"])])],
    ["clock", command => {
      isClockShown = command["show"] === true;
    }],
    ["subscriber", command => {
      isSubscriberShown = command["show"] === true;
    }],
    ["external", command => {
      isExternalShown = command["show"] === true;
    }],
    ["bump-external", () => {
      external.value++;
      external.update();
    }],
    ["motion", command => moveMotion(Number(command["target"]))],
    ["reactivity", () => {
      prices.set("tea", TEA_PRICE);
      prices.set("coffee", COFFEE_PRICE);
      tags.add("a");
      tags.add("b");
      tags.add("a");
      stamp.setFullYear(STAMP_YEAR);
    }],
    ["close", () => exitApplication()]
  ]);
  // svelte-ignore state_referenced_locally
  host.onCommand(command => commands.get(String(command["cmd"]))?.(command));
</script>

<Window
  height={WINDOW_HEIGHT}
  onclosed={exitApplication}
  placement={{
    x: -8000,
    y: 0
  }}
  title="Stores example"
  width={WINDOW_WIDTH}
>
  <StackPanel class="app">
    <StackPanel class="column">
      <TextBlock automationId="count">{$count}</TextBlock>
      <Button automationId="increment" onclick={() => count.update(value => value + 1)}>Add one</Button>
      <Button automationId="assign" onclick={() => $count = FULL}>Set one hundred</Button>
      <TextBlock automationId="double">{$double}</TextBlock>
      <TextBlock automationId="sum">{$sum}</TextBlock>
      <StoreReader automationId="reader" store={count} />
      <TextBlock automationId="stepper">{$stepper}</TextBlock>
      <ContextReader />
      <TextBlock automationId="context-parent">{$contextLabel}</TextBlock>
    </StackPanel>
    <StackPanel class="column">
      <TextBox automationId="name" bind:text={$name} />
      <TextBlock automationId="name-echo">{$name}</TextBlock>
      <NumberBox automationId="amount" bind:value={$amount} />
      <ToggleSwitch automationId="enabled" bind:isOn={$isEnabled} />
      {#if $isEnabled}
        <TextBlock automationId="enabled-note">Enabled</TextBlock>
      {/if}
      <StackPanel automationId="items">
        {#each $items as item (item)}
          <TextBlock>{item}</TextBlock>
        {/each}
      </StackPanel>
      {#if isClockShown}
        <StoreReader automationId="clock" store={clock} />
      {/if}
      {#if isSubscriberShown}
        <Subscriber store={count} />
      {/if}
      {#if isExternalShown}
        <TextBlock automationId="external">{shown.external}</TextBlock>
      {/if}
    </StackPanel>
    <StackPanel class="column">
      <ProgressBar automationId="tween" maximum={FULL} value={tween.current} />
      <ProgressBar automationId="spring-bar" maximum={FULL} value={physical.current * FULL} />
      <Border style:opacity={shown.opacity} automationId="faded">
        <TextBlock>{shown.tweened} / {shown.springStore}</TextBlock>
      </Border>
      <TextBlock automationId="wide">{wide.current}</TextBlock>
      <TextBlock automationId="prices">{shown.priceTotal}</TextBlock>
      <TextBlock automationId="tags">{tags.size}</TextBlock>
    </StackPanel>
  </StackPanel>
</Window>

<style>
  .app {
    display: flex;
    flex-direction: row;
    padding: 24px;
  }

  .column {
    width: 400px;
  }
</style>
