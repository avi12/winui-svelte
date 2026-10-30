<script lang="ts">
  import type { ExampleCommand, ExampleHost } from "#examples/harness/contract.ts";
  import { SvelteMap } from "svelte/reactivity";
  import { control } from "winui-svelte";
  import {
    Button,
    ContentDialog,
    Flyout,
    MenuFlyout,
    MenuFlyoutItem,
    StackPanel,
    TextBlock,
    Window
  } from "winui-svelte/components";
  import { exitApplication } from "winui-svelte/window";

  const WINDOW_HEIGHT = 480;
  const WINDOW_WIDTH = 520;

  interface Props {
    // The harness's, handed over once: it never changes.
    host: ExampleHost;
  }

  interface Closable {
    isOpen?: boolean;
    hide(): void;
  }

  const { host }: Props = $props();

  let isFlyoutOpen = $state(false);
  let isMenuOpen = $state(false);
  let isFirstOpen = $state(false);
  let isSecondOpen = $state(false);
  // How many times each overlay opened and closed, as WinUI reports it, and
  // what each dialog answered.
  const opened = $state<Record<string, number>>({});
  const closed = $state<Record<string, number>>({});
  const results = $state<string[]>([]);
  const controls = new SvelteMap<string, Closable>();

  function tally(name: string) {
    return {
      onOpened() {
        opened[name] = (opened[name] ?? 0) + 1;
      },
      onClosed() {
        closed[name] = (closed[name] ?? 0) + 1;
      }
    };
  }

  function keep(name: string) {
    return control((native: Closable) => {
      controls.set(name, native);
    });
  }

  function shown(name: string) {
    return (opened[name] ?? 0) - (closed[name] ?? 0);
  }

  function report(kind: string) {
    host.report({
      kind,
      flyoutOpen: isFlyoutOpen,
      menuOpen: isMenuOpen,
      firstOpen: isFirstOpen,
      secondOpen: isSecondOpen,
      flyoutShown: shown("flyout"),
      menuShown: shown("menu"),
      firstShown: shown("first"),
      secondShown: shown("second"),
      results: results.join(",")
    });
  }

  const setters = new Map<string, (isOpen: boolean) => void>([
    ["flyout", isOpen => {
      isFlyoutOpen = isOpen;
    }],
    ["menu", isOpen => {
      isMenuOpen = isOpen;
    }],
    ["first", isOpen => {
      isFirstOpen = isOpen;
    }],
    ["second", isOpen => {
      isSecondOpen = isOpen;
    }]
  ]);

  const commands = new Map<string, (command: ExampleCommand) => void>([
    ["stats", () => report("stats")],
    ["open", command => {
      setters.get(String(command["name"]))?.(command["isOpen"] === true);
      report("opened");
    }],
    // What the user does: close the overlay itself (light dismiss, Escape).
    ["dismiss", command => {
      controls.get(String(command["name"]))?.hide();
      report("dismissed");
    }],
    ["close", () => exitApplication()]
  ]);
  // svelte-ignore state_referenced_locally
  host.onCommand(command => commands.get(String(command["cmd"]))?.(command));
</script>

<Window
  height={WINDOW_HEIGHT}
  onClosed={exitApplication}
  title="Overlays example"
  width={WINDOW_WIDTH}
>
  <StackPanel>
    <TextBlock>Flyouts and dialogs, opened from state</TextBlock>
    <Button>
      Menu
      {#snippet flyout()}
        <MenuFlyout {@attach keep("menu")} bind:open={isMenuOpen} {...tally("menu")}>
          <MenuFlyoutItem>Copy</MenuFlyoutItem>
          <MenuFlyoutItem>Paste</MenuFlyoutItem>
        </MenuFlyout>
      {/snippet}
    </Button>
    <Flyout {@attach keep("flyout")} bind:open={isFlyoutOpen} {...tally("flyout")}>
      <TextBlock>Opens next to the panel it is written in</TextBlock>
    </Flyout>
    <ContentDialog
      {@attach keep("first")}
      closeButtonText="Close"
      onResult={result => results.push(`first:${result}`)}
      primaryButtonText="OK"
      title="First"
      bind:open={isFirstOpen}
      {...tally("first")}
    >
      The first dialog
    </ContentDialog>
    <ContentDialog
      {@attach keep("second")}
      closeButtonText="Close"
      onResult={result => results.push(`second:${result}`)}
      title="Second"
      bind:open={isSecondOpen}
      {...tally("second")}
    >
      The second dialog waits for the first
    </ContentDialog>
  </StackPanel>
</Window>
