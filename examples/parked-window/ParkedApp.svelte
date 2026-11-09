<script lang="ts">
  import { PAGE_HTML } from "./page.ts";
  import type { ExampleCommand, ExampleHost } from "#examples/harness/contract.ts";
  import { ExtendedStyle, hasExtendedStyles } from "#src/window/native.js";
  import { WebView2, Window } from "winui-svelte/components";
  import type { WindowHandle } from "winui-svelte/components";
  import { defineMessaging } from "winui-svelte/messaging";
  import type { ProtocolWithReturn } from "winui-svelte/messaging";
  import { webView2Transport } from "winui-svelte/messaging/web-view2";
  import { exitApplication } from "winui-svelte/window";

  const WINDOW_HEIGHT = 720;
  const WINDOW_WIDTH = 900;
  const MILLISECONDS_PER_SECOND = 1000;
  const START_PAGE = "about:blank";

  interface Beat {
    time: number;
    visibility: string;
    frames: number;
  }

  interface HeartbeatProtocol {
    beat: ProtocolWithReturn<Beat, void>;
  }

  const { host }: { host: ExampleHost } = $props();

  // svelte-ignore state_referenced_locally
  const IS_HIDDEN = host.options["hidden"] === "true";
  let handle: WindowHandle | undefined = $state();
  let beats: Beat[] = [];
  let isPageRequested = false;
  let closeBridge: (() => void) | undefined;

  function readback() {
    const appWindow = handle?.appWindow;
    const isOpen = appWindow !== undefined;
    if (!isOpen) {
      return {};
    }

    const hwnd = appWindow.id.value;
    return {
      isVisible: appWindow.isVisible,
      isToolWindow: hasExtendedStyles({
        hwnd,
        styles: ExtendedStyle.toolWindow
      }),
      isNoActivate: hasExtendedStyles({
        hwnd,
        styles: ExtendedStyle.noActivate
      }),
      bounds: {
        x: appWindow.position.x,
        y: appWindow.position.y,
        width: appWindow.size.width,
        height: appWindow.size.height
      }
    };
  }

  function summary() {
    const first = beats[0];
    const last = beats.at(-1);
    const isMeasured = first !== undefined && last !== undefined && last !== first;
    if (!isMeasured) {
      return {
        beatCount: beats.length,
        averageGap: 0,
        visibility: last?.visibility ?? "",
        framesPerSecond: 0
      };
    }

    const milliseconds = last.time - first.time;
    return {
      beatCount: beats.length,
      averageGap: milliseconds / (beats.length - 1),
      visibility: last.visibility,
      framesPerSecond: (last.frames - first.frames) * MILLISECONDS_PER_SECOND / milliseconds
    };
  }

  const commands = new Map<string, (command: ExampleCommand) => void>([
    ["info", () => host.report({
      kind: "info",
      ...readback()
    })],
    ["reset", () => {
      beats = [];
      host.report({ kind: "reset" });
    }],
    ["stats", () => host.report({
      kind: "stats",
      ...readback(),
      ...summary()
    })],
    ["close", () => exitApplication()]
  ]);
  // svelte-ignore state_referenced_locally
  host.onCommand(command => commands.get(String(command["cmd"]))?.(command));

  function connect(control: Parameters<typeof webView2Transport>[0]["control"]) {
    const transport = webView2Transport({ control });
    const bridge = defineMessaging<HeartbeatProtocol>({ transport });
    bridge.onMessage("beat", async message => {
      beats.push(message.data);
    });
    closeBridge = () => {
      bridge.close();
      transport.dispose();
    };
  }
</script>

<Window
  activate={false}
  height={WINDOW_HEIGHT}
  isHidden={IS_HIDDEN}
  isParked={!IS_HIDDEN}
  onclosed={() => {
    closeBridge?.();
    exitApplication();
  }}
  title="Parked window example"
  width={WINDOW_WIDTH}
  bind:handle
>
  <WebView2
    oncorewebview2initialized={(sender, args) => {
      const isStarted = args.exception === 0;
      if (isStarted) {
        connect(sender);
      }
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
