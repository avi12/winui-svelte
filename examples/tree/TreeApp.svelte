<script lang="ts">
  import type { TreeItem } from "./tree-item.ts";
  import { makeTree } from "./tree-item.ts";
  import TreeRow from "./TreeRow.svelte";
  import type { ExampleCommand, ExampleHost } from "#examples/harness/contract.ts";
  import { liveRows, rowStats } from "#examples/lists/row-stats.ts";
  import { unboxed } from "winui-svelte";
  import { TreeView, Window } from "winui-svelte/components";
  import { exitApplication } from "winui-svelte/window";

  const DEFAULT_ROOTS = 3;
  const BRANCHING = 2;
  const DEPTH = 3;
  const WINDOW_HEIGHT = 640;
  const WINDOW_WIDTH = 420;
  const INDENT = "  ";

  interface Props {
    // The harness's, handed over once: it never changes.
    host: ExampleHost;
  }

  // The nodes the control holds, as the example reads them.
  interface ControlLevel {
    readonly size: number;
    getAt(index: number): ControlNode;
  }

  interface ControlNode {
    content: unknown;
    isExpanded: boolean;
    hasUnrealizedChildren: boolean;
    readonly children: ControlLevel | null;
  }

  interface ControlTree {
    readonly rootNodes: ControlLevel | null;
    readonly selectedNodes: ControlLevel | null;
    selectedNode: ControlNode | null;
  }

  const { host }: Props = $props();

  // svelte-ignore state_referenced_locally
  const items = $state(
    makeTree({
      roots: Number(host.options["rows"] ?? DEFAULT_ROOTS),
      branching: BRANCHING,
      depth: DEPTH
    })
  );
  let expandedKeys: string[] | undefined = $state();
  let selectedKey: string | undefined = $state();
  let selectedKeys: string[] | undefined = $state();
  let view: ControlTree | undefined;

  function keyOf(node: ControlNode) {
    return String(unboxed(node.content));
  }

  function nodesIn(level: ControlLevel | null | undefined) {
    const nodes = Array.from({ length: level?.size ?? 0 }, (_unused, index) => level?.getAt(index));
    return nodes.filter(node => node !== undefined);
  }

  // The nodes the control holds, in the order it shows them, each with how deep it is.
  function* nodesBelow(roots: ControlLevel | null | undefined) {
    const pending = nodesIn(roots).map(node => ({
      node,
      depth: 0
    })).reverse();
    for (let entry = pending.pop(); entry !== undefined; entry = pending.pop()) {
      yield entry;
      const { depth } = entry;
      pending.push(
        ...nodesIn(entry.node.children).map(node => ({
          node,
          depth: depth + 1
        })).reverse()
      );
    }
  }

  // The items, in the order the tree shows them, each with the array that holds it.
  function* itemsBelow(roots: TreeItem[]) {
    const pending = roots.map(item => ({
      item,
      siblings: roots
    })).reverse();
    for (let entry = pending.pop(); entry !== undefined; entry = pending.pop()) {
      yield entry;
      const { children } = entry.item;
      pending.push(
        ...children.map(item => ({
          item,
          siblings: children
        })).reverse()
      );
    }
  }

  // The nodes as lines, in the order the control shows them: the key, "+" when
  // expanded, "?" when it has children it has not made, indented by depth.
  function shape() {
    return Array.from(nodesBelow(view?.rootNodes), ({ node, depth }) => {
      const flags = `${node.isExpanded ? "+" : ""}${node.hasUnrealizedChildren ? "?" : ""}`;
      return `${INDENT.repeat(depth)}${keyOf(node)}${flags}`;
    });
  }

  function nodeOf(key: string) {
    return Array.from(nodesBelow(view?.rootNodes)).find(({ node }) => keyOf(node) === key)?.node;
  }

  function entryOf(key: string) {
    return Array.from(itemsBelow(items)).find(({ item }) => item.id === key);
  }

  function report(kind: string) {
    host.report({
      kind,
      created: rowStats.created,
      destroyed: rowStats.destroyed,
      live: liveRows(),
      expandedKeys: expandedKeys === undefined ? null : [...expandedKeys],
      selectedKey: selectedKey ?? null,
      selectedKeys: selectedKeys === undefined ? null : [...selectedKeys],
      controlSelected: nodesIn(view?.selectedNodes).map(keyOf),
      tree: shape()
    });
  }

  function stringsOf(value: unknown) {
    return Array.isArray(value) ? value.map(String) : [];
  }

  // What a test or a script can ask of the window.
  const commands = new Map<string, (command: ExampleCommand) => void>([
    ["stats", () => report("stats")],
    // As the user does: through the control, which then asks for the children.
    ["expand", command => {
      const node = nodeOf(String(command["key"]));
      const isFound = node !== undefined;
      if (isFound) {
        node.isExpanded = command["expanded"] !== false;
      }

      report("expanded");
    }],
    ["expandKeys", command => {
      expandedKeys = stringsOf(command["keys"]);
      report("expandedKeys");
    }],
    ["select", command => {
      selectedKey = command["key"] === null ? undefined : String(command["key"]);
      report("selected");
    }],
    ["selectKeys", command => {
      selectedKeys = stringsOf(command["keys"]);
      report("selectedKeys");
    }],
    // As the user does: through the control.
    ["pick", command => {
      const node = nodeOf(String(command["key"]));
      const control = view;
      const canPick = node !== undefined && control !== undefined;
      if (canPick) {
        control.selectedNode = node;
      }

      report("picked");
    }],
    ["rename", command => {
      const entry = entryOf(String(command["key"]));
      const isFound = entry !== undefined;
      if (isFound) {
        entry.item.name = String(command["name"]);
      }

      report("renamed");
    }],
    ["add", command => {
      entryOf(String(command["parent"]))?.item.children.push({
        id: String(command["key"]),
        name: String(command["name"] ?? command["key"]),
        children: []
      });
      report("added");
    }],
    ["remove", command => {
      const entry = entryOf(String(command["key"]));
      entry?.siblings.splice(entry.siblings.indexOf(entry.item), 1);
      report("removed");
    }],
    ["moveFirst", command => {
      const entry = entryOf(String(command["key"]));
      const isFound = entry !== undefined;
      if (isFound) {
        entry.siblings.splice(entry.siblings.indexOf(entry.item), 1);
        entry.siblings.unshift(entry.item);
      }

      report("moved");
    }],
    ["close", () => exitApplication()]
  ]);
  // svelte-ignore state_referenced_locally
  host.onCommand(command => commands.get(String(command["cmd"]))?.(command));
</script>

{#snippet rowOf(item: TreeItem)}
  <TreeRow {item} />
{/snippet}

<Window
  height={WINDOW_HEIGHT}
  onClosed={exitApplication}
  title="Tree example"
  width={WINDOW_WIDTH}
>
  <TreeView
    children={item => item.children}
    item={rowOf}
    itemName={item => item.name}
    {items}
    key={item => item.id}
    onControl={control => {
      view = control;
    }}
    selectionMode={host.options["selection"] === "multiple" ? "Multiple" : "Single"}
    bind:expandedKeys
    bind:selectedKey
    bind:selectedKeys
  />
</Window>
