<script lang="ts">
  import type { ExampleCommand, ExampleHost } from "#examples/harness/contract.ts";
  import { WebView2, Window } from "winui-svelte/components";
  import {
    blockRequests,
    callDevToolsMethod,
    executeScript,
    ResourceContext,
    TypeMode,
    typeText
  } from "winui-svelte/messaging/web-view2";
  import { exitApplication } from "winui-svelte/window";

  const WINDOW_HEIGHT = 480;
  const WINDOW_WIDTH = 640;
  const START_PAGE = "about:blank";
  const BLOCKED_URI = "*/RotateCookies*";
  const FOCUS_CODE = "document.getElementById('box').focus(); true";
  const READ_CODE = "({ value: document.getElementById('box').value, rotate: window.rotateStatus ?? null, title: document.title })";

  interface Props {
    host: ExampleHost;
  }

  const { host }: Props = $props();
  type Control = Parameters<typeof blockRequests>[0]["control"];
  let control: Control | undefined;
  const blocked = Promise.withResolvers<void>();

  async function type(command: ExampleCommand) {
    await blocked.promise;

    if (!control) {
      return;
    }

    const text = String(command["text"]);
    const isInserting = command["mode"] === "insert";
    const mode = isInserting ? TypeMode.INSERT_AFTER_FIRST : TypeMode.KEYS;
    await executeScript({
      control,
      code: FOCUS_CODE
    });
    const started = performance.now();
    await typeText({
      control,
      text,
      mode
    });
    const milliseconds = performance.now() - started;
    host.report({
      kind: "typed",
      milliseconds,
      page: await executeScript({
        control,
        code: READ_CODE
      })
    });
  }

  async function read() {
    await blocked.promise;

    if (!control) {
      return;
    }

    host.report({
      kind: "page",
      page: await executeScript({
        control,
        code: READ_CODE
      }),
      evaluated: await callDevToolsMethod({
        control,
        method: "Runtime.evaluate",
        parameters: {
          expression: "document.title"
        }
      })
    });
  }

  const commands = new Map<string, (command: ExampleCommand) => void | Promise<void>>([
    ["navigate", async command => {
      await blocked.promise;

      if (control) {
        await callDevToolsMethod({
          control,
          method: "Page.navigate",
          parameters: {
            url: String(command["url"])
          }
        });
      }
    }],
    ["page", read],
    ["type", type],
    ["close", () => exitApplication()]
  ]);
  // svelte-ignore state_referenced_locally
  host.onCommand(command => {
    void Promise.resolve(commands.get(String(command["cmd"]))?.(command)).catch((error: unknown) => {
      host.report({
        kind: "error",
        message: String(error)
      });
    });
  });
</script>

<Window
  height={WINDOW_HEIGHT}
  onclosed={() => {
    host.report({ kind: "closed" });
    exitApplication();
  }}
  title="Web requests example"
  width={WINDOW_WIDTH}
>
  <WebView2
    oncorewebview2initialized={async sender => {
      control = sender;
      // coreWebView2 is not set yet while the event is being raised
      await new Promise(resolve => setTimeout(resolve));
      await blockRequests({
        control: sender,
        uri: BLOCKED_URI,
        context: ResourceContext.ALL
      });
      blocked.resolve();
    }}
    source={START_PAGE}
  />
</Window>
