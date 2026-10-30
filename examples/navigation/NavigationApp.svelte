<script lang="ts">
  import AboutPage from "./AboutPage.svelte";
  import CounterPage from "./CounterPage.svelte";
  import HomePage from "./HomePage.svelte";
  import { pageStats } from "./page-stats.ts";
  import type { ExampleCommand, ExampleHost } from "#examples/harness/contract.ts";
  import { projectAs } from "#winui/lifetime";
  import type { NavigationView as NavigationViewControl } from "#winui/microsoft/ui/xaml/controls/NavigationView";
  import { NavigationViewItem as NavigationViewItemControl } from "#winui/microsoft/ui/xaml/controls/NavigationViewItem";
  import type { NavigationViewItemBase } from "#winui/microsoft/ui/xaml/controls/NavigationViewItemBase";
  import { untrack } from "svelte";
  import { SvelteMap } from "svelte/reactivity";
  import { control, unboxed } from "winui-svelte";
  import type { NavigatorHandle, PageComponent } from "winui-svelte/components";
  import {
    DrillInNavigationTransitionInfo,
    NavigationCacheMode,
    NavigationView,
    NavigationViewItem,
    Navigator,
    Window
  } from "winui-svelte/components";
  import { exitApplication } from "winui-svelte/window";

  const WINDOW_HEIGHT = 480;
  const WINDOW_WIDTH = 640;
  const VERSION = "1.0";

  interface Props {
    // The harness's, handed over once: it never changes.
    host: ExampleHost;
  }

  const { host }: Props = $props();

  // Each item of the menu is a page: how to go to it, and the component that
  // says the history is at it.
  const routes = new Map<string, {
    page: PageComponent;
    open: (navigator: NavigatorHandle) => void;
  }>([
    ["home", {
      page: HomePage,
      open: navigator => navigator.navigate({ page: HomePage })
    }],
    ["counter", {
      page: CounterPage,
      open: navigator => navigator.navigate({
        page: {
          component: CounterPage,
          cacheMode: NavigationCacheMode.REQUIRED
        },
        params: {
          title: "Counter"
        }
      })
    }],
    ["about", {
      page: AboutPage,
      open: navigator => navigator.navigate({
        page: AboutPage,
        params: {
          version: VERSION
        }
      })
    }]
  ]);

  let navigator = $state<NavigatorHandle | undefined>();
  let view = $state.raw<NavigationViewControl | undefined>();
  const items = new SvelteMap<string, NavigationViewItemControl>();

  // The key of the page the history is at.
  function currentKey() {
    const page = navigator?.current?.page;
    return [...routes].find(([, route]) => route.page === page)?.[0] ?? "";
  }

  function openPage(key: string) {
    const route = routes.get(key);
    const handle = navigator;
    const isGoingTo = handle !== undefined && route !== undefined && key !== currentKey();
    if (isGoingTo) {
      route.open(handle);
    }
  }

  // The selection follows the history (back and forward move it), and
  // choosing an item goes to its page; the page already shown is not gone to
  // again, which ends the loop between the two.
  $effect(() => {
    const item = items.get(currentKey());
    const menu = view;
    const isReady = menu !== undefined && item !== undefined;
    if (isReady) {
      untrack(() => {
        menu.selectedItem = item;
      });
    }
  });

  function keep(key: string) {
    return control((native: NavigationViewItemControl) => {
      items.set(key, native);
      return () => items.delete(key);
    });
  }

  function chosen(container: NavigationViewItemBase) {
    const key = unboxed(container.tag);
    const isPage = typeof key === "string";
    if (isPage) {
      openPage(key);
    }
  }

  // The key of the item the menu has selected now.
  function selectedKey() {
    const selected = view?.selectedItem;
    const isItem = selected !== undefined && selected !== null;
    return isItem ? String(unboxed(projectAs(selected, NavigationViewItemControl).tag)) : "";
  }

  function report(kind: string) {
    host.report({
      kind,
      page: currentKey(),
      canGoBack: navigator?.canGoBack ?? false,
      canGoForward: navigator?.canGoForward ?? false,
      selected: selectedKey(),
      homeCreated: pageStats.home.created,
      homeDestroyed: pageStats.home.destroyed,
      counterCreated: pageStats.counter.created,
      counterDestroyed: pageStats.counter.destroyed,
      aboutCreated: pageStats.about.created,
      aboutDestroyed: pageStats.about.destroyed,
      counterValue: pageStats.counterValue
    });
  }

  const commands = new Map<string, (command: ExampleCommand) => void>([
    ["stats", () => report("stats")],
    ["navigate", command => {
      openPage(String(command["to"]));
      report("navigated");
    }],
    ["back", () => {
      navigator?.goBack();
      report("navigated");
    }],
    ["forward", () => {
      navigator?.goForward();
      report("navigated");
    }],
    ["bump", () => {
      pageStats.bump();
      report("bumped");
    }],
    ["select", command => {
      const item = items.get(String(command["to"]));
      const menu = view;
      const isReady = menu !== undefined && item !== undefined;
      if (isReady) {
        menu.selectedItem = item;
      }

      report("selected");
    }],
    ["close", () => exitApplication()]
  ]);
  // svelte-ignore state_referenced_locally
  host.onCommand(command => commands.get(String(command["cmd"]))?.(command));
</script>

<Window
  height={WINDOW_HEIGHT}
  onClosed={exitApplication}
  title="Navigation example"
  width={WINDOW_WIDTH}
>
  <NavigationView
    {@attach control((native: NavigationViewControl) => {
      view = native;
    })}
    isBackButtonVisible="Visible"
    isBackEnabled={navigator?.canGoBack ?? false}
    isSettingsVisible={false}
    onBackRequested={() => navigator?.goBack()}
    onSelectionChanged={(_sender, args) => chosen(args.selectedItemContainer)}
  >
    {#snippet menuItems()}
      <NavigationViewItem {@attach keep("home")} content="Home" tag="home" />
      <NavigationViewItem {@attach keep("counter")} content="Counter" tag="counter" />
      <NavigationViewItem {@attach keep("about")} content="About" tag="about" />
    {/snippet}
    <Navigator onReady={ready => routes.get("home")?.open(ready)} bind:handle={navigator}>
      {#snippet transition()}
        <DrillInNavigationTransitionInfo />
      {/snippet}
    </Navigator>
  </NavigationView>
</Window>
