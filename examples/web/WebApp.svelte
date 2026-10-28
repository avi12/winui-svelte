<script lang="ts">
  import type { ExampleCommand, ExampleHost } from "#examples/harness/contract.ts";
  import { WebView2, Window } from "winui-svelte/components";
  import { exitApplication } from "winui-svelte/window";

  const WINDOW_HEIGHT = 480;
  const WINDOW_WIDTH = 640;
  // A page WebView2 allows as the top frame (it blocks a data: URL there).
  const PAGE = "about:blank";

  interface Props {
    // The harness's, handed over once: it never changes.
    host: ExampleHost;
  }

  const { host }: Props = $props();
  const status = {
    isInitialized: false,
    // The HRESULT WebView2 gave when it started its browser; 0 when it started.
    initializationResult: 0,
    isNavigated: false,
    isSuccess: false
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
</script>

<Window
  activate={false}
  height={WINDOW_HEIGHT}
  onClosed={exitApplication}
  placement={{
    x: -8000,
    y: 0
  }}
  title="Web example"
  width={WINDOW_WIDTH}
>
  <WebView2
    onCoreWebView2Initialized={(_sender, args) => {
      status.isInitialized = true;
      status.initializationResult = args.exception;
    }}
    onNavigationCompleted={(_sender, args) => {
      status.isNavigated = true;
      status.isSuccess = args.isSuccess;
    }}
    source={PAGE}
  />
</Window>
