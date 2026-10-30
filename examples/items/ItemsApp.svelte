<script lang="ts">
  import ItemRow from "./ItemRow.svelte";
  import type { ExampleCommand, ExampleHost } from "#examples/harness/contract.ts";
  import type { ExampleItem } from "#examples/lists/example-item.ts";
  import { makeItems } from "#examples/lists/example-item.ts";
  import { liveRows, rowStats } from "#examples/lists/row-stats.ts";
  import { BreadcrumbBar, ItemsRepeater, ItemsView, Window } from "winui-svelte/components";
  import { exitApplication } from "winui-svelte/window";

  const DEFAULT_ROWS = 20;
  const WINDOW_HEIGHT = 480;
  const WINDOW_WIDTH = 520;

  interface Props {
    // The harness's, handed over once: it never changes.
    host: ExampleHost;
  }

  const { host }: Props = $props();

  // svelte-ignore state_referenced_locally
  let rows = $state(makeItems(Number(host.options["rows"] ?? DEFAULT_ROWS)));

  function report(kind: string) {
    host.report({
      kind,
      rows: rows.length,
      created: rowStats.created,
      destroyed: rowStats.destroyed,
      live: liveRows()
    });
  }

  const commands = new Map<string, (command: ExampleCommand) => void>([
    ["stats", () => report("stats")],
    ["rename", command => {
      const row = rows.find(candidate => candidate.id === command["key"]);
      const isFound = row !== undefined;
      if (isFound) {
        row.name = String(command["name"]);
      }

      report("renamed");
    }],
    ["remove", command => {
      rows = rows.filter(row => row.id !== command["key"]);
      report("removed");
    }],
    ["clear", () => {
      rows = [];
      report("cleared");
    }],
    ["close", () => exitApplication()]
  ]);
  // svelte-ignore state_referenced_locally
  host.onCommand(command => commands.get(String(command["cmd"]))?.(command));
</script>

{#snippet rowOf(row: ExampleItem)}
  <ItemRow {row} />
{/snippet}

<Window
  height={WINDOW_HEIGHT}
  onClosed={exitApplication}
  title="Items example"
  width={WINDOW_WIDTH}
>
  {#if host.options["view"] === "itemsView"}
    <ItemsView item={rowOf} items={rows} key={row => row.id} />
  {:else if host.options["view"] === "breadcrumb"}
    <BreadcrumbBar item={rowOf} items={rows} key={row => row.id} />
  {:else}
    <ItemsRepeater item={rowOf} items={rows} key={row => row.id} />
  {/if}
</Window>
