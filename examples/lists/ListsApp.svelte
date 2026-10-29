<script lang="ts">
  import type { ExampleItem } from "./example-item.ts";
  import { makeItems } from "./example-item.ts";
  import ExampleRow from "./ExampleRow.svelte";
  import { liveRows, rowStats } from "./row-stats.ts";
  import type { ExampleCommand, ExampleHost } from "#examples/harness/contract.ts";
  import { projectAs } from "#winui/lifetime";
  import { Control } from "#winui/microsoft/ui/xaml/controls/Control";
  import type { DependencyObject } from "#winui/microsoft/ui/xaml/DependencyObject";
  import { unboxed } from "winui-svelte";
  import { GridView, ListView, MoveDirection, Window } from "winui-svelte/components";
  import type { Group, ListHandle } from "winui-svelte/components";
  import { exitApplication } from "winui-svelte/window";

  const DEFAULT_ROWS = 1000;
  const FIRST_ROWS_REPORTED = 5;
  const WINDOW_HEIGHT = 640;
  const WINDOW_WIDTH = 420;
  const ROWS_PER_GROUP = 10;

  interface Props {
    // The harness's, handed over once: it never changes.
    host: ExampleHost;
  }

  const { host }: Props = $props();

  // svelte-ignore state_referenced_locally
  let rows = $state(makeItems(Number(host.options["rows"] ?? DEFAULT_ROWS)));
  let handle: ListHandle | undefined = $state();
  let selectedKey: string | undefined = $state();
  // The list's own control, to read what it holds and to select as a user does.
  let view: {
    readonly items: { readonly size: number };
    containerFromIndex(index: number): DependencyObject | null;
    selectedIndex: number;
    selectedItems: {
      size: number;
      getAt(index: number): unknown;
    } | null;
  } | undefined;
  let reorders = 0;

  function controlSelected() {
    const selected = view?.selectedItems;
    const hasSelected = selected !== undefined && selected !== null;
    if (!hasSelected) {
      return [];
    }

    return Array.from({ length: selected.size }, (_, index) => String(unboxed(selected.getAt(index))));
  }

  function report(kind: string) {
    host.report({
      kind,
      rows: rows.length,
      created: rowStats.created,
      destroyed: rowStats.destroyed,
      live: liveRows(),
      reorders,
      selectedKey: selectedKey ?? null,
      controlSelected: controlSelected(),
      controlItems: view?.items.size ?? 0,
      enabled: enabledPattern(),
      first: rows.slice(0, FIRST_ROWS_REPORTED).map(row => row.id)
    });
  }

  // Which of the list's first rows (a group's header among them) the control lets the user pick.
  function enabledPattern() {
    const size = view?.items.size ?? 0;
    return Array.from({ length: Math.min(size, ROWS_PER_GROUP + 2) }, (_unused, index) => {
      const container = view?.containerFromIndex(index);
      const isDisabled = container !== null && container !== undefined && !projectAs(container, Control).isEnabled;
      return isDisabled ? "0" : "1";
    }).join("");
  }

  function groupOf(row: ExampleItem) {
    return `Group ${Math.floor(Number(row.id.slice("row-".length)) / ROWS_PER_GROUP)}`;
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
    ["select", command => {
      selectedKey = command["key"] === null ? undefined : String(command["key"]);
      report("selected");
    }],
    ["pick", command => {
      if (view) {
        view.selectedIndex = Number(command["index"]);
      }

      report("picked");
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

{#snippet headerOf(group: Group<ExampleItem>)}
  <text-block>{group.key} ({group.items.length})</text-block>
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
  {:else if host.options["view"] === "groups"}
    <ListView
      groupBy={groupOf}
      groupHeader={headerOf}
      item={rowOf}
      itemName={row => row.name}
      items={rows}
      key={row => row.id}
      onControl={control => {
        view = control;
      }}
      reorderable
      selectionMode="Single"
      bind:selectedKey
    />
  {:else}
    <ListView
      item={rowOf}
      itemName={row => row.name}
      items={rows}
      key={row => row.id}
      keyboardReorder
      onControl={control => {
        view = control;
      }}
      onReorder={reorder}
      reorderable
      selectionMode={host.options["selection"] === "single" ? "Single" : "None"}
      bind:handle
      bind:selectedKey
    />
  {/if}
</Window>
