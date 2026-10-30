<script lang="ts">
  import type { ExampleItem } from "./example-item.ts";
  import { makeItems } from "./example-item.ts";
  import ExampleRow from "./ExampleRow.svelte";
  import { liveRows, rowStats } from "./row-stats.ts";
  import type { ExampleCommand, ExampleHost } from "#examples/harness/contract.ts";
  import { projectAs } from "#winui/lifetime";
  import { ContentControl } from "#winui/microsoft/ui/xaml/controls/ContentControl";
  import { ItemsStackPanel } from "#winui/microsoft/ui/xaml/controls/ItemsStackPanel";
  import type { ListViewBase } from "#winui/microsoft/ui/xaml/controls/ListViewBase";
  import { ListViewHeaderItem } from "#winui/microsoft/ui/xaml/controls/ListViewHeaderItem";
  import { TextBlock } from "#winui/microsoft/ui/xaml/controls/TextBlock";
  import type { DependencyObject } from "#winui/microsoft/ui/xaml/DependencyObject";
  import { VisualTreeHelper } from "#winui/microsoft/ui/xaml/media/VisualTreeHelper";
  import { unboxed } from "winui-svelte";
  import { GridView, ListView, Window } from "winui-svelte/components";
  import type { Group, ListHandle } from "winui-svelte/components";
  import { ListViewSelectionMode, MoveDirection } from "winui-svelte/enums";
  import { exitApplication } from "winui-svelte/window";

  const DEFAULT_ROWS = 1000;
  const FIRST_ROWS_REPORTED = 5;
  const WINDOW_HEIGHT = 640;
  const WINDOW_WIDTH = 420;
  const ROWS_PER_GROUP = 10;
  // Where WinUI parks a container it recycles (a pixel measure, in the thousands).
  const PARKED_TOP = 1000;

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
  let view: ListViewBase | undefined;
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
      headers: headers(),
      isSticky: isSticky(),
      first: rows.slice(0, FIRST_ROWS_REPORTED).map(row => row.id)
    });
  }

  // The group headers the list shows, as "text@top". WinUI parks the containers it recycles far above the list:
  // only the ones in or near it count.
  function headers() {
    const found: string[] = [];
    const pending: DependencyObject[] = view === undefined ? [] : [view];
    for (let parent = pending.pop(); parent !== undefined; parent = pending.pop()) {
      const count = VisualTreeHelper.getChildrenCount(parent);
      for (let i = 0; i < count; i++) {
        const child = VisualTreeHelper.getChild(parent, i);
        const text = headerText(child);
        const isHeader = text !== undefined;
        if (isHeader) {
          found.push(text);
        }

        pending.push(child);
      }
    }

    return found;
  }

  // WinUI pins the header of the group in view to the top of the list from its composition layer, which
  // layout coordinates do not show: the panel's switch is what can be read.
  function isSticky() {
    const panel = view?.itemsPanelRoot;
    return panel !== null && panel !== undefined && projectAs(panel, ItemsStackPanel).areStickyGroupHeadersEnabled;
  }

  function headerText(element: DependencyObject) {
    try {
      const header = projectAs(element, ListViewHeaderItem);
      const root = header.contentTemplateRoot;
      const y = view === undefined ? 0 : Math.round(
        header.transformToVisual(view).transformPoint({
          x: 0,
          y: 0
        }).y
      );
      const isParked = y < -PARKED_TOP;
      if (isParked) {
        return undefined;
      }

      if (!root) {
        return undefined;
      }

      const content = projectAs(root, ContentControl).content;
      const hasContent = content !== null;
      return hasContent ? `${projectAs(content, TextBlock).text}@${y}` : undefined;
    } catch {
      return undefined;
    }
  }

  function groupOf(row: ExampleItem) {
    const number = Number(row.id.slice("row-".length));
    return Number.isNaN(number) ? "Extra" : `Group ${Math.floor(number / ROWS_PER_GROUP)}`;
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
    ["prepend", () => {
      rows = [{
        id: "row-extra",
        name: "Extra item"
      }, ...rows];
      report("prepended");
    }],
    ["drop-group", command => {
      rows = rows.filter(row => groupOf(row) !== command["group"]);
      report("dropped");
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
  height={WINDOW_HEIGHT}
  onclosed={exitApplication}
  title="Lists example"
  width={WINDOW_WIDTH}
>
  {#if host.options["view"] === "grid"}
    <GridView
      item={rowOf}
      itemName={row => row.name}
      items={rows}
      key={row => row.id}
      onreorder={reorder}
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
      oncontrol={control => {
        view = control;
      }}
      reorderable
      selectionMode={ListViewSelectionMode.Single}
      bind:handle
      bind:selectedKey
    />
  {:else}
    <ListView
      item={rowOf}
      itemName={row => row.name}
      items={rows}
      key={row => row.id}
      keyboardReorder
      oncontrol={control => {
        view = control;
      }}
      onreorder={reorder}
      reorderable
      selectionMode={host.options["selection"] === "single" ? ListViewSelectionMode.Single : ListViewSelectionMode.None}
      bind:handle
      bind:selectedKey
    />
  {/if}
</Window>
