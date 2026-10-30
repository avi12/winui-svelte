<script lang="ts">
  import PageFrame from "#examples/gallery/PageFrame.svelte";
  import { keyControl } from "#examples/harness/smoke.ts";
  import {
    GridView,
    ListView,
    StackPanel,
    TextBlock,
    TreeView
  } from "winui-svelte/components";

  interface Fruit {
    id: string;
    name: string;
    color: string;
  }

  interface Folder {
    path: string;
    name: string;
    children: Folder[];
  }

  const INITIAL: Fruit[] = [
    {
      id: "apple",
      name: "Apple",
      color: "red"
    },
    {
      id: "banana",
      name: "Banana",
      color: "yellow"
    },
    {
      id: "cherry",
      name: "Cherry",
      color: "red"
    },
    {
      id: "lime",
      name: "Lime",
      color: "green"
    },
    {
      id: "kiwi",
      name: "Kiwi",
      color: "green"
    }
  ];
  const FOLDERS: Folder[] = [
    {
      path: "src",
      name: "src",
      children: [
        {
          path: "src/app",
          name: "app",
          children: []
        },
        {
          path: "src/lib",
          name: "lib",
          children: []
        }
      ]
    },
    {
      path: "docs",
      name: "docs",
      children: []
    }
  ];

  const fruits = $state(INITIAL);
  let selectedKey = $state<string | undefined>("banana");
  let order = $state("");
  let expandedKeys = $state<string[]>(["src"]);
  let folderKey = $state<string | undefined>();

  function reordered(keys: string[]) {
    order = keys.join(" > ");
  }
</script>

<PageFrame
  caption="Lists are keyed: a row lives as long as its key, and the selection is a key, not an index. Groups, drag reorder and trees use the same keys."
  title="Lists"
>
  <StackPanel class="lists-block">
    <TextBlock text="ListView, keyed, reorderable. Selected: {selectedKey ?? "none"}. {order}" />
    <ListView
      class="lists-view"
      {@attach keyControl("lists")}
      items={fruits}
      key={fruit => fruit.id}
      keyboardReorder
      onreorder={reordered}
      reorderable
      bind:selectedKey
    >
      {#snippet item(fruit)}
        <TextBlock text="{fruit.name} ({fruit.color})" />
      {/snippet}
    </ListView>
    <ListView class="lists-view" groupBy={fruit => fruit.color} items={fruits} key={fruit => fruit.id}>
      {#snippet item(fruit)}
        <TextBlock text={fruit.name} />
      {/snippet}
      {#snippet groupHeader(group)}
        <TextBlock text="{group.key} ({group.items.length})" />
      {/snippet}
    </ListView>
    <GridView class="lists-view" items={fruits} key={fruit => fruit.id}>
      {#snippet item(fruit)}
        <TextBlock text={fruit.name} />
      {/snippet}
    </GridView>
    <TextBlock text="TreeView. Selected: {folderKey ?? "none"}" />
    <TreeView
      class="lists-view"
      children={folder => folder.children}
      items={FOLDERS}
      key={folder => folder.path}
      bind:expandedKeys
      bind:selectedKey={folderKey}
    >
      {#snippet item(folder)}
        <TextBlock text={folder.name} />
      {/snippet}
    </TreeView>
  </StackPanel>
</PageFrame>

<style>
  :global(.lists-block) {
    gap: 8px;
  }

  :global(.lists-view) {
    height: 150px;
  }
</style>
