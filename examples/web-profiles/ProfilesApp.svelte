<script lang="ts">
  import type { ExampleCommand, ExampleHost } from "#examples/harness/contract.ts";
  import { projectAs } from "#winui/lifetime";
  import { WebView2 as WebView2Element } from "#winui/microsoft/ui/xaml/controls/WebView2";
  import { StackPanel, WebView2, Window } from "winui-svelte/components";
  import { createWebView2Environment, getCookies, setCookie, startWebView2 } from "winui-svelte/messaging/web-view2";
  import type { WebView2Like } from "winui-svelte/messaging/web-view2";
  import { exitApplication } from "winui-svelte/window";

  const WINDOW_HEIGHT = 480;
  const WINDOW_WIDTH = 640;
  const PANE_HEIGHT = 200;
  const COOKIE_DOMAIN = "profiles.example";
  const COOKIE_URI = `https://${COOKIE_DOMAIN}/`;
  // Read back from the browser's command line to prove the switch arrived
  const FLAG = "--webview-profiles-example";

  interface Pane {
    control: WebView2Like | undefined;
    isStarted: boolean;
    startError: string;
    userDataFolder: string;
    browserProcessId: number;
  }

  interface Props {
    // The harness's, handed over once: it never changes.
    host: ExampleHost;
  }

  const { host }: Props = $props();
  function newPane() {
    const pane: Pane = {
      control: undefined,
      isStarted: false,
      startError: "",
      userDataFolder: "",
      browserProcessId: 0
    };
    return pane;
  }

  const first = newPane();
  const second = newPane();
  const panes = [first, second];

  async function startPane({ pane, control, userDataFolder, profileName }: {
    pane: Pane;
    control: WebView2Like;
    userDataFolder: string;
    profileName: string;
  }) {
    pane.control = control;
    try {
      const environment = await createWebView2Environment({
        userDataFolder,
        additionalBrowserArguments: [FLAG, "--autoplay-policy=no-user-gesture-required"],
        language: "en-US"
      });
      const core = await startWebView2({
        control,
        environment,
        profileName
      });
      pane.userDataFolder = core.environment.userDataFolder;
      pane.browserProcessId = core.browserProcessId;
      pane.isStarted = true;
    } catch (error) {
      pane.startError = String(error);
    }
  }

  async function cookies() {
    const { control: firstControl } = first;
    const { control: secondControl } = second;
    const isReady = firstControl !== undefined && secondControl !== undefined;
    if (!isReady) {
      return;
    }

    await setCookie({
      control: firstControl,
      cookie: {
        name: "who",
        value: "first",
        domain: COOKIE_DOMAIN
      }
    });
    const inFirst = await getCookies({
      control: firstControl,
      uri: COOKIE_URI
    });
    const inSecond = await getCookies({
      control: secondControl,
      uri: COOKIE_URI
    });
    host.report({
      kind: "cookies",
      inFirst: inFirst.map(cookie => cookie.value),
      inSecond: inSecond.map(cookie => cookie.value)
    });
  }

  const commands = new Map<string, (command: ExampleCommand) => void>([
    ["stats", () => host.report({
      kind: "stats",
      panes: panes.map(({ isStarted, startError, userDataFolder, browserProcessId }) => ({
        isStarted,
        startError,
        userDataFolder,
        browserProcessId
      }))
    })],
    ["cookies", () => {
      cookies().catch((error: unknown) => host.report({
        kind: "error",
        error: String(error)
      }));
    }],
    ["close", () => exitApplication()]
  ]);
  // svelte-ignore state_referenced_locally
  host.onCommand(command => commands.get(String(command["cmd"]))?.(command));
</script>

<Window
  height={WINDOW_HEIGHT}
  onclosed={() => {
    host.report({ kind: "closed" });
    exitApplication();
  }}
  title="Web profiles example"
  width={WINDOW_WIDTH}
>
  <StackPanel>
    <WebView2
      height={PANE_HEIGHT}
      onloaded={sender => void startPane({
        pane: first,
        control: projectAs(sender, WebView2Element),
        userDataFolder: host.options["first"] ?? "",
        profileName: "first"
      })}
    />
    <WebView2
      height={PANE_HEIGHT}
      onloaded={sender => void startPane({
        pane: second,
        control: projectAs(sender, WebView2Element),
        userDataFolder: host.options["second"] ?? "",
        profileName: "second"
      })}
    />
  </StackPanel>
</Window>
