<script lang="ts">
  import { GALLERY_PAGES } from "./pages.ts";
  import { shell } from "./shell.svelte.ts";
  import type { ExampleCommand, ExampleHost } from "#examples/harness/contract.ts";
  import { keyControl, serveExample } from "#examples/harness/smoke.ts";
  import { unboxed } from "winui-svelte";
  import type { NavigatorHandle } from "winui-svelte/components";
  import {
    DrillInNavigationTransitionInfo,
    NavigationView,
    NavigationViewItem,
    Navigator,
    Window
  } from "winui-svelte/components";

  const WINDOW_HEIGHT = 720;
  const WINDOW_WIDTH = 1000;

  interface Props {
    // The harness's, handed over once: it never changes.
    host: ExampleHost;
  }

  const { host }: Props = $props();

  let navigator = $state<NavigatorHandle>();
  let currentKey = $state("");

  function open(key: string) {
    const route = GALLERY_PAGES.find(candidate => candidate.key === key);
    const isGoingTo = route !== undefined && key !== currentKey;
    if (isGoingTo) {
      navigator?.navigate({ page: route.page });
      currentKey = key;
    }
  }

  const commands = new Map<string, (command: ExampleCommand) => void>([
    ["navigate", command => {
      open(String(command["to"]));
      host.report({ kind: "navigated" });
    }],
    ["pages", () => host.report({
      kind: "pages",
      keys: GALLERY_PAGES.map(route => route.key)
    })]
  ]);
  // svelte-ignore state_referenced_locally
  serveExample({
    host,
    commands
  });
</script>

<Window
  backdrop={shell.backdrop}
  height={WINDOW_HEIGHT}
  onClosed={() => host.report({ kind: "closed" })}
  onClosing={() => shell.isCloseBlocked}
  presentation={shell.presentation}
  theme={shell.theme}
  title={shell.title}
  width={WINDOW_WIDTH}
  bind:handle={shell.handle}
>
  <NavigationView
    {@attach keyControl("gallery")}
    isBackButtonVisible="Collapsed"
    isSettingsVisible={false}
    onSelectionChanged={(_sender, args) => {
      const key = unboxed(args.selectedItemContainer.tag);
      open(String(key));
    }}
  >
    {#snippet menuItems()}
      {#each GALLERY_PAGES as route (route.key)}
        <NavigationViewItem content={route.title} isSelected={route.key === GALLERY_PAGES[0]?.key} tag={route.key} />
      {/each}
    {/snippet}
    <Navigator onReady={() => open(GALLERY_PAGES[0]?.key ?? "")} bind:handle={navigator}>
      {#snippet transition()}
        <DrillInNavigationTransitionInfo />
      {/snippet}
    </Navigator>
  </NavigationView>
</Window>
