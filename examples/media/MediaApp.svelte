<script lang="ts">
  import type { ExampleCommand, ExampleHost } from "#examples/harness/contract.ts";
  import { projectAs } from "#src/winui.js";
  import type { Border as BorderControl } from "#winui/microsoft/ui/xaml/controls/Border";
  import { SolidColorBrush } from "#winui/microsoft/ui/xaml/media/SolidColorBrush";
  import { MediaQuery } from "svelte/reactivity";
  import { control, elementTheme, flush } from "winui-svelte";
  import { Border, StackPanel, TextBlock, Window } from "winui-svelte/components";
  import { ElementTheme } from "winui-svelte/enums";
  import {
    exitApplication,
    installMatchMedia,
    matchMedia,
    mediaQuery,
    systemSettings
  } from "winui-svelte/window";

  const WINDOW_HEIGHT = 360;
  const WINDOW_WIDTH = 480;

  interface Props {
    host: ExampleHost;
  }

  const { host }: Props = $props();

  // Installed before anything asks for it, so Svelte's MediaQuery finds it.
  installMatchMedia();
  const settings = systemSettings();
  const theme = elementTheme();
  const isDark = mediaQuery("(prefers-color-scheme: dark)");
  const isReduced = mediaQuery("(prefers-reduced-motion: reduce)");
  const isMore = mediaQuery("(prefers-contrast: more)");
  const svelteDark = new MediaQuery("prefers-color-scheme: dark", false);
  const list = matchMedia("(prefers-color-scheme: dark)");

  function requestedTheme() {
    if (settings.isDarkTheme) {
      return ElementTheme.Dark;
    }

    return ElementTheme.Light;
  }

  let changes = $state(0);
  list.addEventListener("change", () => {
    changes++;
  });
  let probe: BorderControl | undefined;
  let card: BorderControl | undefined;

  function backgroundRed(element: BorderControl | undefined) {
    const brush = element?.background;
    const hasBrush = brush !== undefined && brush !== null;
    return hasBrush ? projectAs(brush, SolidColorBrush).color.r : null;
  }

  function report(kind: string) {
    flush();
    host.report({
      kind,
      isDark: isDark.matches,
      isReduced: isReduced.matches,
      isMore: isMore.matches,
      svelteDark: svelteDark.current,
      listDark: list.matches,
      changes,
      textScaleFactor: settings.textScaleFactor,
      theme: theme.current,
      width: probe?.width,
      height: probe?.height,
      minWidth: probe?.minWidth,
      hasTransition: probe?.opacityTransition !== null,
      probeTheme: probe?.actualTheme,
      red: backgroundRed(probe),
      cardRed: backgroundRed(card)
    });
  }

  const commands = new Map<string, (command: ExampleCommand) => void>([
    ["stats", () => report("stats")],
    ["close", () => exitApplication()]
  ]);
  // svelte-ignore state_referenced_locally
  host.onCommand(command => commands.get(String(command["cmd"]))?.(command));
</script>

<Window
  activate={false}
  height={WINDOW_HEIGHT}
  onclosed={exitApplication}
  placement={{
    x: -8000,
    y: 0
  }}
  title="Media example"
  width={WINDOW_WIDTH}
>
  <StackPanel {@attach theme.attach} requestedTheme={requestedTheme()}>
    <Border
      class="media-probe"
      {@attach control<BorderControl>(native => {
        probe = native;
      })}
    />
    <Border
      class="media-card"
      {@attach control<BorderControl>(native => {
        card = native;
      })}
    />
    <TextBlock>Dark {isDark.matches}, reduced motion {isReduced.matches}, contrast {isMore.matches}</TextBlock>
    <TextBlock>Text scale {settings.textScaleFactor}, changes {changes}</TextBlock>
  </StackPanel>
</Window>

<style>
  :root {
    --media-card: #ffffff;

    @media (prefers-color-scheme: dark) {
      --media-card: #000000;
    }
  }

  .media-card {
    height: 10px;
    background-color: var(--media-card);
  }

  .media-probe {
    background-color: light-dark(#ffffff, #000000);
    opacity: 1;
    transition: opacity 300ms;

    @media (prefers-color-scheme: dark) {
      width: 111px;
    }

    @media (forced-colors: active) {
      height: 77px;
    }

    @media (prefers-reduced-transparency: reduce) {
      min-width: 55px;
    }
  }
</style>
