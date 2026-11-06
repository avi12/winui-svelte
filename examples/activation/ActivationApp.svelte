<script lang="ts">
  import type { ExampleCommand, ExampleHost } from "#examples/harness/contract.ts";
  import { flush } from "winui-svelte";
  import {
    ActivationKind,
    installProtocolHandlers,
    registerFileTypes,
    startActivation,
    unregisterFileTypes
  } from "winui-svelte/app/activation";
  import type { ActivationEvent } from "winui-svelte/app/activation";
  import { Button, StackPanel, TextBlock, Window } from "winui-svelte/components";
  import { exitApplication } from "winui-svelte/window";

  const WINDOW_HEIGHT = 320;
  const WINDOW_WIDTH = 520;
  const DEFAULT_KEY = "dev.winui-svelte.examples.activation";
  const APP_ID = "dev.winui-svelte.examples.activation";
  const SCHEME = "note";
  const EXTENSIONS = [".note"];
  const HANDLER_URL = "https://notes.example/open?uri=%s";

  interface Props {
    // The harness's, handed over once: it never changes.
    host: ExampleHost;
  }

  const { host }: Props = $props();

  const events: ActivationEvent[] = $state([]);
  let isPrimary: boolean | undefined = $state();
  let status = $state("Not registered by this window");

  function describe(event: ActivationEvent) {
    const isProtocol = event.kind === ActivationKind.protocol;
    if (isProtocol) {
      return event.uri;
    }

    const isFile = event.kind === ActivationKind.file;
    if (isFile) {
      return event.files.join(", ");
    }

    return event.arguments.join(" ");
  }

  function labelOf(event: ActivationEvent) {
    const origin = event.isRedirect ? " (from another copy)" : "";
    return `${event.kind}${origin}: ${describe(event)}`;
  }

  function summarize(event: ActivationEvent) {
    return {
      kind: event.kind,
      isRedirect: event.isRedirect,
      detail: describe(event)
    };
  }

  function claim() {
    const single = startActivation({
      key: host.options["key"] ?? DEFAULT_KEY,
      extensions: EXTENSIONS,
      onActivation(event) {
        events.push(event);
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

  function register() {
    const uninstall = installProtocolHandlers();
    try {
      navigator.registerProtocolHandler(SCHEME, HANDLER_URL);
    } finally {
      uninstall();
    }

    registerFileTypes({
      id: APP_ID,
      extensions: EXTENSIONS,
      description: "Note"
    });
    status = `Registered ${SCHEME}: links and ${EXTENSIONS.join(", ")} files for this user`;
  }

  function unregister() {
    const uninstall = installProtocolHandlers();
    try {
      navigator.unregisterProtocolHandler(SCHEME, HANDLER_URL);
    } finally {
      uninstall();
    }

    unregisterFileTypes({
      id: APP_ID,
      extensions: EXTENSIONS
    });
    status = "Registrations removed";
  }

  function report() {
    flush();
    host.report({
      kind: "stats",
      isPrimary,
      events: events.map(summarize)
    });
  }

  const commands = new Map<string, (command: ExampleCommand) => void>([
    ["stats", report],
    ["close", () => exitApplication()]
  ]);
  // svelte-ignore state_referenced_locally
  host.onCommand(command => commands.get(String(command["cmd"]))?.(command));
</script>

<Window
  height={WINDOW_HEIGHT}
  onclosed={() => exitApplication()}
  title="Activation example"
  width={WINDOW_WIDTH}
>
  <StackPanel>
    <TextBlock>Open a {EXTENSIONS.join(", ")} file or a {SCHEME}: link with this app</TextBlock>
    <TextBlock>{status}</TextBlock>
    <Button onclick={register}>Register for this user</Button>
    <Button onclick={unregister}>Unregister</Button>
    <TextBlock>Activations: {events.length}</TextBlock>
    {#each events as event, iEvent (iEvent)}
      <TextBlock>{labelOf(event)}</TextBlock>
    {/each}
  </StackPanel>
</Window>
