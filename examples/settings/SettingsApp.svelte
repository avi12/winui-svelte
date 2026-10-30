<script lang="ts">
  import AboutPage from "./AboutPage.svelte";
  import AppearancePage from "./AppearancePage.svelte";
  import GeneralPage from "./GeneralPage.svelte";
  import { preferences } from "./preferences.svelte.ts";
  import type { ExampleHost } from "#examples/harness/contract.ts";
  import { serveExample } from "#examples/harness/smoke.ts";
  import { unboxed } from "winui-svelte";
  import type { NavigatorHandle } from "winui-svelte/components";
  import { NavigationView, NavigationViewItem, Navigator, Window } from "winui-svelte/components";
  import { NavigationViewBackButtonVisible } from "winui-svelte/enums";

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
    <text-block class="title">Settings</text-block>
  {/snippet}
  <NavigationView
    isBackButtonVisible={NavigationViewBackButtonVisible.Collapsed}
    isSettingsVisible={false}
    onselectionchanged={(_sender, args) => open(String(unboxed(args.selectedItemContainer.tag)))}
  >
    {#snippet menuItems()}
      {#each PAGES as route (route.key)}
        <NavigationViewItem isSelected={route.key === PAGES[0]?.key} tag={route.key}>{route.title}</NavigationViewItem>
      {/each}
    {/snippet}
    <Navigator onready={() => open(PAGES[0]?.key ?? "")} bind:handle={navigator} />
  </NavigationView>
</Window>

<style>
  .title {
    padding: 8px 16px;
  }
</style>
