<script lang="ts">
  import { PAGE_HTML } from "./page.ts";
  import type { ExampleCommand, ExampleHost } from "#examples/harness/contract.ts";
  import { WebView2, Window } from "winui-svelte/components";
  import { keepWebView2Alive } from "winui-svelte/messaging/web-view2";
  import type { CoreWebView2Like, WebView2Like } from "winui-svelte/messaging/web-view2";
  import { exitApplication } from "winui-svelte/window";
  import { z } from "zod";

  const WINDOW_HEIGHT = 480;
  const WINDOW_WIDTH = 640;
  // A source makes the control start its browser; the page is set once it has
  const START_PAGE = "about:blank";
  const PING = "ping";

  const messageSchema = z.object({ type: z.enum(["tick", "pong"]) });

  interface Props {
    // The harness's, handed over once: it never changes.
    host: ExampleHost;
  }

  const { host }: Props = $props();

  // The key of the WebView2: bumping it replaces the control, and the new one
  // announces itself through oncorewebview2initialized
  let generation = $state(0);
  let nextControl = Promise.withResolvers<WebView2Like>();
  const status = {
    state: "starting",
    rebuilds: 0,
    ticks: 0,
    pongs: 0,
    browserProcessId: 0,
    giveUpReason: ""
  };
  let core: CoreWebView2Like | undefined;
  let guard: ReturnType<typeof keepWebView2Alive> | undefined;

  function track(ready: CoreWebView2Like) {
    core = ready;
    status.browserProcessId = ready.browserProcessId;
    status.state = "up";
    ready.onWebMessageReceived((_sender, args) => {
      const { type } = messageSchema.parse(JSON.parse(args.webMessageAsJson));
      status.ticks += type === "tick" ? 1 : 0;
      status.pongs += type === "pong" ? 1 : 0;
    });
  }

  function mounted(control: WebView2Like) {
    const isRebuild = guard !== undefined;
    if (isRebuild) {
      nextControl.resolve(control);
      return;
    }

    guard = keepWebView2Alive({
      control,
      setup: track,
      rebuild() {
        status.rebuilds += 1;
        nextControl = Promise.withResolvers<WebView2Like>();
        generation += 1;
        return nextControl.promise;
      },
      onRecovering() {
        status.state = "recovering";
      },
      onGaveUp({ reason }) {
        status.state = "down";
        status.giveUpReason = reason;
      }
    });
  }

  const commands = new Map<string, (command: ExampleCommand) => void>([
    ["stats", () => host.report({
      kind: "stats",
      ...status
    })],
    ["ping", () => core?.postWebMessageAsJson(JSON.stringify(PING))],
    ["close", () => {
      guard?.dispose();
      exitApplication();
    }]
  ]);
  // svelte-ignore state_referenced_locally
  host.onCommand(command => commands.get(String(command["cmd"]))?.(command));
</script>

<Window
  height={WINDOW_HEIGHT}
  onclosed={() => {
    guard?.dispose();
    host.report({ kind: "closed" });
    exitApplication();
  }}
  title="Web recovery example"
  width={WINDOW_WIDTH}
>
  {#key generation}
    {@const isPageRequested = { value: false }}
    <WebView2
      oncorewebview2initialized={sender => mounted(sender)}
      onnavigationcompleted={sender => {
        if (isPageRequested.value) {
          return;
        }

        isPageRequested.value = true;
        sender.coreWebView2.navigateToString(PAGE_HTML);
      }}
      source={START_PAGE}
    />
  {/key}
</Window>
