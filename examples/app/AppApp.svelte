<script lang="ts">
  import type { ExampleCommand, ExampleHost } from "#examples/harness/contract.ts";
  import { flush } from "winui-svelte";
  import { ensureSingleInstance, notify } from "winui-svelte/app";
  import { StackPanel, TextBlock, Window } from "winui-svelte/components";
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

  function claim() {
    const single = ensureSingleInstance({
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
    ["close", () => exitApplication()]
  ]);
  // svelte-ignore state_referenced_locally
  host.onCommand(command => commands.get(String(command["cmd"]))?.(command));
</script>

<Window
  height={WINDOW_HEIGHT}
  onClosed={exitApplication}
  title="App example"
  width={WINDOW_WIDTH}
>
  <StackPanel>
    <TextBlock>Primary copy: {isPrimary}</TextBlock>
    <TextBlock>Other copies redirected here: {redirects} {lastArguments}</TextBlock>
    <TextBlock>High contrast: {settings.isHighContrast}</TextBlock>
  </StackPanel>
</Window>
