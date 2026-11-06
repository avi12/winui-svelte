<script lang="ts">
  import type { ExampleCommand, ExampleHost } from "#examples/harness/contract.ts";
  import { fileURLToPath } from "node:url";
  import { flush } from "winui-svelte";
  import { ensureSingleInstance, notify, relaunch, restartAfterCrash } from "winui-svelte/app";
  import type { SingleInstance } from "winui-svelte/app";
  import { StackPanel, TextBlock, Window } from "winui-svelte/components";
  import type { WindowHandle } from "winui-svelte/components";
  import { exitApplication, systemSettings } from "winui-svelte/window";

  const WINDOW_HEIGHT = 240;
  const WINDOW_WIDTH = 480;
  const DEFAULT_KEY = "dev.winui-svelte.examples.app";

  interface Props {
    // The harness's, handed over once: it never changes.
    host: ExampleHost;
  }

  const { host }: Props = $props();

  const settings = systemSettings();
  let isPrimary: boolean | undefined = $state();
  let redirects = $state(0);
  let lastArguments = $state("");
  let single: SingleInstance | undefined;
  let handle: WindowHandle | undefined = $state();
  let isExitOnClose = true;

  function claim() {
    single = ensureSingleInstance({
      key: host.options["key"] ?? DEFAULT_KEY,
      onRedirect(activation) {
        redirects += 1;
        lastArguments = activation.arguments.join(" ");
      }
    });
    isPrimary = single.isPrimary;

    if (!single.isPrimary) {
      host.report({
        kind: "stats",
        isPrimary
      });
      exitApplication();
    }
  }
  claim();

  // The windows run in the harness's worker, so the script that starts the
  // process is the launcher; a copy gets the same entry and the key it is told.
  const LAUNCHER = fileURLToPath(new URL("../harness/launch.ts", import.meta.url));

  function nextCopyArguments(command: ExampleCommand) {
    return [process.argv[2] ?? "", "--key", String(command["key"])];
  }

  function register(command: ExampleCommand) {
    try {
      restartAfterCrash({
        arguments: nextCopyArguments(command),
        entryScript: LAUNCHER
      });
      host.report({
        kind: "restartRegistered"
      });
    } catch (error) {
      host.report({
        kind: "restartRegistered",
        error: String(error)
      });
    }
  }

  function showNotification() {
    try {
      const id = notify({
        title: "winui-svelte",
        body: "A notification from the app subpath",
        appUserModelId: "dev.winui-svelte.examples.app"
      });
      host.report({
        kind: "notified",
        id
      });
    } catch (error) {
      host.report({
        kind: "notified",
        error: String(error)
      });
    }
  }

  // The application ends because its last window closed, not because the app
  // asked it to.
  function closeWindowOnly() {
    isExitOnClose = false;
    handle?.close();
  }

  function report() {
    flush();
    host.report({
      kind: "stats",
      isPrimary,
      redirects,
      lastArguments,
      isHighContrast: settings.isHighContrast
    });
  }

  const commands = new Map<string, (command: ExampleCommand) => void>([
    ["stats", report],
    ["notify", showNotification],
    ["registerRestart", register],
    ["relaunch", command => relaunch({
      arguments: nextCopyArguments(command),
      entryScript: LAUNCHER,
      instance: single
    })],
    ["close", () => exitApplication()],
    ["closeWindowOnly", closeWindowOnly]
  ]);
  // svelte-ignore state_referenced_locally
  host.onCommand(command => commands.get(String(command["cmd"]))?.(command));
</script>

<Window
  height={WINDOW_HEIGHT}
  onclosed={() => isExitOnClose && exitApplication()}
  title="App example"
  width={WINDOW_WIDTH}
  bind:handle
>
  <StackPanel>
    <TextBlock>Primary copy: {isPrimary}</TextBlock>
    <TextBlock>Other copies redirected here: {redirects} {lastArguments}</TextBlock>
    <TextBlock>High contrast: {settings.isHighContrast}</TextBlock>
  </StackPanel>
</Window>
