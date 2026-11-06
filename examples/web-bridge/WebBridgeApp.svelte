<script lang="ts">
  import { PAGE_HTML } from "./page.ts";
  import type { ExampleCommand, ExampleHost } from "#examples/harness/contract.ts";
  import { WebView2, Window } from "winui-svelte/components";
  import { defineMessaging } from "winui-svelte/messaging";
  import type { ProtocolWithReturn } from "winui-svelte/messaging";
  import { webView2Transport } from "winui-svelte/messaging/web-view2";
  import { exitApplication } from "winui-svelte/window";

  const WINDOW_HEIGHT = 480;
  const WINDOW_WIDTH = 640;
  // A source makes the control start its browser; the page is set once it has
  // (WebView2 blocks a data: URL as the top frame).
  const START_PAGE = "about:blank";

  interface BridgeProtocol {
    greet: ProtocolWithReturn<string, string>;
    ready: ProtocolWithReturn<void, void>;
    title: ProtocolWithReturn<void, string>;
  }

  interface Props {
    // The harness's, handed over once: it never changes.
    host: ExampleHost;
  }

  const { host }: Props = $props();
  const status = {
    isInitialized: false,
    // The HRESULT WebView2 gave when it started its browser; 0 when it started.
    initializationResult: 0,
    greeting: "",
    pageTitle: ""
  };

  const commands = new Map<string, (command: ExampleCommand) => void>([
    ["stats", () => host.report({
      kind: "stats",
      ...status
    })],
    ["close", () => exitApplication()]
  ]);
  // svelte-ignore state_referenced_locally
  host.onCommand(command => commands.get(String(command["cmd"]))?.(command));

  let isPageRequested = false;
  let closeBridge: (() => void) | undefined;

  function connect(control: Parameters<typeof webView2Transport>[0]["control"]) {
    const transport = webView2Transport({ control });
    const bridge = defineMessaging<BridgeProtocol>({ transport });
    bridge.onMessage("greet", message => {
      status.greeting = message.data;
      return `hello ${message.data}`;
    });
    bridge.onMessage("ready", async () => {
      status.pageTitle = await bridge.sendMessage("title");
    });
    closeBridge = () => {
      bridge.close();
      transport.dispose();
    };
  }
</script>

<Window
  height={WINDOW_HEIGHT}
  onclosed={() => {
    closeBridge?.();
    host.report({ kind: "closed" });
    exitApplication();
  }}
  title="Web bridge example"
  width={WINDOW_WIDTH}
>
  <WebView2
    oncorewebview2initialized={(sender, args) => {
      status.isInitialized = true;
      status.initializationResult = args.exception;
      connect(sender);
    }}
    onnavigationcompleted={sender => {
      if (isPageRequested) {
        return;
      }

      isPageRequested = true;
      sender.coreWebView2.navigateToString(PAGE_HTML);
    }}
    source={START_PAGE}
  />
</Window>
