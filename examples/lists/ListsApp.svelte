<script lang="ts">
  import type { ExampleItem } from "./example-item.ts";
  import { makeItems } from "./example-item.ts";
  import ExampleRow from "./ExampleRow.svelte";
  import { liveRows, rowStats } from "./row-stats.ts";
  import type { ExampleCommand, ExampleHost } from "#examples/harness/contract.ts";
  import { GridView, ListView, MoveDirection, Window } from "winui-svelte/components";
  import type { ListHandle } from "winui-svelte/components";
  import { exitApplication } from "winui-svelte/window";

  const DEFAULT_ROWS = 1000;
  const FIRST_ROWS_REPORTED = 5;
  const WINDOW_HEIGHT = 640;
  const WINDOW_WIDTH = 420;

  interface Props {
    // The harness's, handed over once: it never changes.
    host: ExampleHost;
  }

  const { host }: Props = $props();

  // svelte-ignore state_referenced_locally
  let rows = $state(makeItems(Number(host.options["rows"] ?? DEFAULT_ROWS)));
  let handle: ListHandle | undefined = $state();
  let reorders = 0;

  function report(kind: string) {
    host.report({
      kind,
      rows: rows.length,
      created: rowStats.created,
      destroyed: rowStats.destroyed,
      live: liveRows(),
      reorders,
      first: rows.slice(0, FIRST_ROWS_REPORTED).map(row => row.id)
    });
  }

  function reorder(order: string[]) {
    reorders++;
    const byId = new Map(rows.map(row => [row.id, row]));
    rows = order.flatMap(id => byId.get(id) ?? []);
  }

  // What a test or a script can ask of the window.
  const commands = new Map<string, (command: ExampleCommand) => void>([
    ["stats", () => report("stats")],
    ["move", command => {
      const direction = command["direction"] === "up" ? MoveDirection.UP : MoveDirection.DOWN;
      handle?.move({
        key: String(command["key"]),
        direction
      });
      report("moved");
    }],
    ["scroll", command => {
      handle?.scrollToKey(String(command["key"]));
      report("scrolled");
    }],
    ["focus", command => {
      handle?.focus(String(command["key"]));
      report("focused");
    }],
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
  <ExampleRow {row} />
{/snippet}

<Window
  activate={false}
  height={WINDOW_HEIGHT}
  onClosed={exitApplication}
  placement={{
    x: -8000,
    y: 0
  }}
  title="Lists example"
  width={WINDOW_WIDTH}
>
  {#if host.options["view"] === "grid"}
    <GridView
      item={rowOf}
      itemName={row => row.name}
      items={rows}
      key={row => row.id}
      onReorder={reorder}
      bind:handle
    />
  {:else}
    <ListView
      item={rowOf}
      itemName={row => row.name}
      items={rows}
      key={row => row.id}
      keyboardReorder
      onReorder={reorder}
      reorderable
      selectionMode="None"
      bind:handle
    />
  {/if}
</Window>
