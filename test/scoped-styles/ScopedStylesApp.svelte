<script lang="ts">
  import { containerOf } from "./container-of.ts";
  import RivalList from "./RivalList.svelte";
  import type { ExampleHost } from "#examples/harness/contract.ts";
  import type { ListViewBase } from "#winui/microsoft/ui/xaml/controls/ListViewBase";
  import { SvelteMap } from "svelte/reactivity";
  import { ListView, StackPanel, Window } from "winui-svelte/components";
  import { exitApplication } from "winui-svelte/window";

  interface Props {
    host: ExampleHost;
  }

  const { host }: Props = $props();

  const views = new SvelteMap<string, ListViewBase>();
  const IS_ON = true;
  const CLASSES = "row";

  function remember(name: string) {
    return (control: ListViewBase) => {
      views.set(name, control);
    };
  }

  // svelte-ignore state_referenced_locally
  host.onCommand(command => {
    const isContainers = command["cmd"] === "containers";
    if (isContainers) {
      host.report({
        kind: "containers",
        containers: Object.fromEntries(views.entries().map(([name, view]) => [name, containerOf(view)]))
      });
    }

    const isClose = command["cmd"] === "close";
    if (isClose) {
      exitApplication();
    }
  });
</script>

{#snippet cell(text: string)}
  <text-block>{text}</text-block>
{/snippet}

<Window height={600} onclosed={exitApplication} title="Scoped styles" width={420}>
  <StackPanel>
    <ListView
      item={cell}
      itemContainerStyle="row"
      itemName={text => text}
      items={["literal"]}
      key={text => text}
      oncontrol={remember("literal")}
    />
    <ListView
      item={cell}
      itemContainerStyle={CLASSES}
      itemName={text => text}
      items={["expression"]}
      key={text => text}
      oncontrol={remember("expression")}
    />
    <ListView
      item={cell}
      itemContainerStyle={IS_ON ? "row" : "none"}
      itemName={text => text}
      items={["conditional"]}
      key={text => text}
      oncontrol={remember("conditional")}
    />
    <ListView
      item={cell}
      itemContainerStyle="global-row"
      itemName={text => text}
      items={["global"]}
      key={text => text}
      oncontrol={remember("global")}
    />
    <RivalList oncontrol={remember("rival")} />
  </StackPanel>
</Window>

<style>
  .row {
    min-height: 36px;
    padding: 0;
  }

  :global(.global-row) {
    min-height: 44px;
    padding: 3px;
  }
</style>
