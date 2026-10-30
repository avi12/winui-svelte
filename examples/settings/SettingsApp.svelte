<script lang="ts">
  import AboutPage from "./AboutPage.svelte";
  import AppearancePage from "./AppearancePage.svelte";
  import GeneralPage from "./GeneralPage.svelte";
  import { preferences } from "./preferences.svelte.ts";
  import type { ExampleHost } from "#examples/harness/contract.ts";
  import { serveExample } from "#examples/harness/smoke.ts";
  import { unboxed } from "winui-svelte";
  import type { NavigatorHandle } from "winui-svelte/components";
  import {
    NavigationView,
    NavigationViewItem,
    Navigator,
    TextBlock,
    Window
  } from "winui-svelte/components";

  const WINDOW_HEIGHT = 520;
  const WINDOW_WIDTH = 760;
  const PAGES = [
    {
      key: "general",
      title: "General",
      page: GeneralPage
    },
    {
      key: "appearance",
      title: "Appearance",
      page: AppearancePage
    },
    {
      key: "about",
      title: "About",
      page: AboutPage
    }
  ];

  interface Props {
    // The harness's, handed over once: it never changes.
    host: ExampleHost;
  }

  const { host }: Props = $props();
  let navigator = $state<NavigatorHandle>();
  let current = "";

  function open(key: string) {
    const route = PAGES.find(candidate => candidate.key === key);
    const isGoingTo = route !== undefined && key !== current;
    if (isGoingTo) {
      current = key;
      navigator?.navigate({ page: route.page });
    }
  }

  // svelte-ignore state_referenced_locally
  serveExample({ host });
</script>

<Window
  backdrop={preferences.backdrop}
  extendsIntoTitleBar
  height={WINDOW_HEIGHT}
  theme={preferences.theme}
  title="Settings"
  width={WINDOW_WIDTH}
>
  {#snippet titleBar()}
    <TextBlock class="settings-title" text="Settings" />
  {/snippet}
  <NavigationView
    isBackButtonVisible="Collapsed"
    isSettingsVisible={false}
    onSelectionChanged={(_sender, args) => open(String(unboxed(args.selectedItemContainer.tag)))}
  >
    {#snippet menuItems()}
      {#each PAGES as route (route.key)}
        <NavigationViewItem content={route.title} isSelected={route.key === PAGES[0]?.key} tag={route.key} />
      {/each}
    {/snippet}
    <Navigator onReady={() => open(PAGES[0]?.key ?? "")} bind:handle={navigator} />
  </NavigationView>
</Window>

<style>
  :global(.settings-title) {
    padding: 8px 16px;
  }

  :global(.settings-page) {
    gap: 12px;
    max-width: 420px;
    padding: 24px;
  }

  :global(.settings-row) {
    gap: 6px;
  }
</style>
