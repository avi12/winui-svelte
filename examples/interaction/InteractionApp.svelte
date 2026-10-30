<script lang="ts">
  import Bomb from "./Bomb.svelte";
  import Card from "./Card.svelte";
  import Counter from "./Counter.svelte";
  import HotPanel from "./HotPanel.svelte";
  import Lifecycle from "./Lifecycle.svelte";
  import {
    handleIds,
    handleOf,
    keep,
    note,
    noted
  } from "./probe.ts";
  import type { ExampleCommand, ExampleHost } from "#examples/harness/contract.ts";
  import { setContext } from "svelte";
  import {
    Button,
    CheckBox,
    ComboBox,
    ComboBoxItem,
    NumberBox,
    RadioButton,
    RadioButtons,
    Slider,
    StackPanel,
    TextBlock,
    TextBox,
    ToggleSwitch,
    Window
  } from "winui-svelte/components";
  import { exitApplication } from "winui-svelte/window";

  const WINDOW_HEIGHT = 1500;
  const WINDOW_WIDTH = 700;
  const INITIAL_SLIDER = 10;
  const INITIAL_NUMBER = 5;
  const SPACING = 4;

  interface Props {
    host: ExampleHost;
  }

  const { host }: Props = $props();

  let componentClicks = $state(0);
  let rawClicks = $state(0);
  let lastClick = $state("");
  let isOn = $state(false);
  let text = $state("start");
  let textChanges = $state(0);
  let sliderValue = $state(INITIAL_SLIDER);
  let numberValue = $state(INITIAL_NUMBER);
  let comboIndex = $state(1);
  let isChecked = $state(false);
  let radioIndex = $state(0);
  let isShown = $state(true);
  let names = $state(["a", "b", "c"]);
  let tag = $state("text-block");
  let isLifecycleShown = $state(true);
  let counterKey = $state(0);
  let isBombArmed = $state(false);
  let isHot = $state(false);
  let rounds = $state(0);
  let pending = $state(new Promise<string>(() => undefined));
  let settle = {
    resolve(_value: string) {},
    reject(_reason: Error) {}
  };
  let isHotPanelShown = $state(true);
  let actionCalls = $state(0);
  let enterPresses = $state(0);

  setContext("theme", "dark");
  $effect(() => {
    note(`effect:rounds=${rounds}`);
  });

  function doubled() {
    return rounds * 2;
  }

  type Word = string;

  function describe(error: unknown) {
    return error instanceof Error ? error.message : "?";
  }

  function newPromise() {
    pending = new Promise<string>((resolve, reject: (reason?: unknown) => void) => {
      settle = {
        resolve,
        reject
      };
    });
  }

  newPromise();

  // eslint-disable-next-line no-restricted-syntax -- Svelte's action signature is (node, parameter)
  function probeAction(_node: object, label: string) {
    actionCalls++;
    note(`action:${label}`);
    return {
      destroy() {
        note(`action-destroy:${label}`);
      }
    };
  }

  function recordFocus(id: string) {
    return () => note(`focus:${id}`);
  }

  function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === "object" && value !== null;
  }

  function nativeOf(id: string) {
    const found: unknown = handleOf(id);
    return isRecord(found) ? found : undefined;
  }

  function nativeValues() {
    return {
      toggle: nativeOf("toggle")?.["isOn"],
      text: nativeOf("text")?.["text"],
      slider: nativeOf("slider")?.["value"],
      number: nativeOf("number")?.["value"],
      combo: nativeOf("combo")?.["selectedIndex"],
      check: nativeOf("check")?.["isChecked"],
      radios: nativeOf("radios")?.["selectedIndex"],
      dynamic: nativeOf("dynamic")?.constructor.name,
      styledOpacity: nativeOf("styled")?.["opacity"],
      arrayOpacity: nativeOf("array")?.["opacity"]
    };
  }

  function snapshot(kind: string) {
    host.report({
      kind,
      componentClicks,
      rawClicks,
      lastClick,
      isOn,
      text,
      textChanges,
      sliderValue,
      numberValue,
      comboIndex,
      isChecked,
      radioIndex,
      names: names.join(","),
      doubled: doubled(),
      actionCalls,
      enterPresses,
      native: nativeValues(),
      handles: handleIds().join(","),
      log: noted().join("|")
    });
  }

  const setters = new Map<string, (value: unknown) => void>([
    ["isOn", value => (isOn = value === true)],
    ["text", value => (text = String(value))],
    ["sliderValue", value => (sliderValue = Number(value))],
    ["numberValue", value => (numberValue = Number(value))],
    ["comboIndex", value => (comboIndex = Number(value))],
    ["isChecked", value => (isChecked = value === true)],
    ["radioIndex", value => (radioIndex = Number(value))],
    ["isShown", value => (isShown = value === true)],
    ["names", value => (names = String(value).split(",").filter(name => name !== ""))],
    ["tag", value => (tag = String(value))],
    ["isLifecycleShown", value => (isLifecycleShown = value === true)],
    ["counterKey", value => (counterKey = Number(value))],
    ["isBombArmed", value => (isBombArmed = value === true)],
    ["isHot", value => (isHot = value === true)],
    ["rounds", value => (rounds = Number(value))],
    ["isHotPanelShown", value => (isHotPanelShown = value === true)]
  ]);

  const commands = new Map<string, (command: ExampleCommand) => void>([
    ["stats", () => snapshot("stats")],
    ["set", command => {
      setters.get(String(command["name"]))?.(command["value"]);
      snapshot("stats");
    }],
    ["resolve", () => {
      settle.resolve("resolved");
      snapshot("stats");
    }],
    ["reject", () => {
      settle.reject(new Error("rejected"));
      snapshot("stats");
    }],
    ["renew", () => {
      newPromise();
      snapshot("stats");
    }],
    ["close", () => exitApplication()]
  ]);
  // svelte-ignore state_referenced_locally
  host.onCommand(command => commands.get(String(command["cmd"]))?.(command));
</script>

{#snippet failedView(error: unknown, reset: () => void)}
  <TextBlock automationId="boundary">failed {describe(error)}</TextBlock>
  <Button
    automationId="boundary-reset" onclick={() => {
      reset();
    }}>reset</Button>
{/snippet}

{#snippet label(value: Word)}
  <TextBlock automationId="snippet">snippet {value}</TextBlock>
{/snippet}

<Window
  height={WINDOW_HEIGHT}
  onclosed={exitApplication}
  title="Interaction example"
  width={WINDOW_WIDTH}
>
  <StackPanel spacing={SPACING}>
    <Button
      {@attach keep("click-component")}
      automationId="click-component"
      onclick={(sender: unknown, args: unknown) => {
        componentClicks++;
        lastClick = `${typeof sender}:${typeof args}:${sender === handleOf("click-component")}`;
      }}
    >component {componentClicks}</Button>
    <!-- svelte-ignore a11y_no_static_element_interactions, a11y_click_events_have_key_events -->
    <hyperlink-button
      {@attach keep("click-raw")}
      onclick={(sender: unknown, args: unknown) => {
        rawClicks++;
        note(`raw:${typeof sender}:${typeof args}`);
      }}
    >raw {rawClicks}</hyperlink-button>
    <ToggleSwitch {@attach keep("toggle")} automationId="toggle" bind:isOn />
    <TextBox
      {@attach keep("text")}
      automationId="text"
      ontextchanged={() => textChanges++}
      bind:text
    />
    <Slider {@attach keep("slider")} automationId="slider" bind:value={sliderValue} />
    <NumberBox {@attach keep("number")} automationId="number" bind:value={numberValue} />
    <ComboBox {@attach keep("combo")} automationId="combo" bind:selectedIndex={comboIndex}>
      <ComboBoxItem>zero</ComboBoxItem>
      <ComboBoxItem>one</ComboBoxItem>
      <ComboBoxItem>two</ComboBoxItem>
    </ComboBox>
    <CheckBox {@attach keep("check")} automationId="check" bind:isChecked>check</CheckBox>
    <RadioButtons {@attach keep("radios")} automationId="radios" bind:selectedIndex={radioIndex}>
      {#snippet items()}
        <RadioButton automationId="radio-0">first</RadioButton>
        <RadioButton automationId="radio-1">second</RadioButton>
      {/snippet}
    </RadioButtons>

    <TextBlock automationId="derived">derived {doubled()}</TextBlock>
    {#if isShown}
      <TextBlock automationId="if-block">shown</TextBlock>
    {:else}
      <TextBlock automationId="else-block">hidden</TextBlock>
    {/if}
    <StackPanel {@attach keep("list")} automationId="list">
      {#each names as name, i (name)}
        <TextBlock automationId={`item-${name}`}>{name}{i}</TextBlock>
      {/each}
    </StackPanel>
    <grid columns="*" rows="Auto,Auto,Auto,Auto">
      {#each names as name, i (name)}
        <text-block grid.row={i}>{name}@{i}</text-block>
      {/each}
    </grid>
    {#await pending}
      <TextBlock automationId="await">pending</TextBlock>
    {:then value}
      <TextBlock automationId="await">then {value}</TextBlock>
    {:catch}
      <TextBlock automationId="await">catch rejected</TextBlock>
    {/await}
    {#key counterKey}
      <Counter />
    {/key}
    {@render label("direct")}
    <Card>
      {#snippet header(title)}
        <TextBlock automationId="card-header">header {title}</TextBlock>
      {/snippet}
      <TextBlock automationId="card-body">body</TextBlock>
    </Card>
    <text-block
      style:opacity={isHot ? "0.25" : "1"}
      class:hot={isHot}
      {@attach keep("styled")}
      use:probeAction={"styled"}
    >styled</text-block>
    <text-block
      class={["base", isHot && "hot", { extra: isHot }]}
      {@attach keep("array")}
    >array</text-block>
    <svelte:element this={tag} {@attach keep("dynamic")}>dynamic</svelte:element>
    <svelte:boundary failed={failedView}>
      {#key isBombArmed}
        <Bomb isArmed={isBombArmed} />
      {/key}
    </svelte:boundary>
    {#if isLifecycleShown}
      <Lifecycle />
    {/if}
    {#if isHotPanelShown}
      <HotPanel />
    {/if}
    <Button automationId="tab-1" ongotfocus={recordFocus("tab-1")}>tab 1</Button>
    <TextBox automationId="tab-2" ongotfocus={recordFocus("tab-2")} />
    <Button automationId="tab-3" onclick={() => enterPresses++} ongotfocus={recordFocus("tab-3")}>tab 3</Button>
  </StackPanel>
</Window>

<style>
  .hot {
    opacity: 25%;
  }
</style>
