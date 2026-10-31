<script lang="ts">
  import {
    createScratch,
    echoOverTcp,
    echoOverWebSocket,
    fetchAsStream,
    hearChildProcess,
    hearWorker,
    readBigFile,
    readWithCallback,
    readWithPromise,
    requestOverHttp,
    sendOverChannel,
    startServers,
    watchFolder
  } from "./background-work.ts";
  import type { ExampleHost } from "#examples/harness/contract.ts";
  import type { TextBlock as NativeTextBlock } from "#winui/microsoft/ui/xaml/controls/TextBlock";
  import { elementRef } from "winui-svelte";
  import { StackPanel, TextBlock, Window } from "winui-svelte/components";
  import { exitApplication } from "winui-svelte/window";

  const WINDOW_HEIGHT = 200;
  const WINDOW_WIDTH = 420;
  const FRAME_MILLISECONDS = 16;
  const TIMER_SAMPLES = 100;

  const { host }: { host: ExampleHost } = $props();
  const clock = elementRef<NativeTextBlock>();
  const message = elementRef<NativeTextBlock>();
  const scratch = createScratch();
  const servers = startServers();
  let ticks = $state(0);
  let messageText = $state("");
  let lastTickAt = performance.now();
  let longestGap = 0;
  let slowFrames = 0;
  let isAnimating = true;

  $effect(() => {
    const interval = setInterval(() => {
      if (!isAnimating) {
        return;
      }

      const now = performance.now();
      const gap = now - lastTickAt;
      lastTickAt = now;
      longestGap = Math.max(longestGap, gap);
      slowFrames += gap > 2 * FRAME_MILLISECONDS ? 1 : 0;
      ticks += 1;
    }, FRAME_MILLISECONDS);
    return () => clearInterval(interval);
  });

  $effect(() => () => {
    scratch.remove();
    void servers.then(running => running.close());
  });

  const operations = new Map<string, () => Promise<string>>([
    ["fsPromises", () => readWithPromise(scratch.small)],
    ["fsCallback", () => readWithCallback(scratch.small)],
    ["fsWatch", () => watchFolder(scratch.folder)],
    ["http", async () => requestOverHttp((await servers).httpPort)],
    ["fetch", async () => fetchAsStream((await servers).httpPort)],
    ["net", async () => echoOverTcp((await servers).netPort)],
    ["webSocket", async () => echoOverWebSocket((await servers).httpPort)],
    ["channel", sendOverChannel],
    ["worker", hearWorker],
    ["childProcess", hearChildProcess],
    ["bigFile", async () => `${await readBigFile(scratch.big)} bytes`]
  ]);

  async function run(name: string) {
    const startedAt = performance.now();
    longestGap = 0;
    slowFrames = 0;
    const operation = operations.get(name);
    const value = operation === undefined ? "unknown operation" : await operation();
    messageText = value;
    host.report({
      kind: "done",
      name,
      value,
      elapsed: performance.now() - startedAt,
      longestGap,
      slowFrames
    });
  }

  async function measureTimers(delay: number) {
    let total = 0;
    let worst = 0;
    for (let i = 0; i < TIMER_SAMPLES; i += 1) {
      const startedAt = performance.now();
      await new Promise(resolve => setTimeout(resolve, delay));
      const late = performance.now() - startedAt - delay;
      total += late;
      worst = Math.max(worst, late);
    }

    host.report({
      kind: "timers",
      delay,
      meanLate: total / TIMER_SAMPLES,
      worstLate: worst
    });
  }

  const commands = new Map<string, (command: Record<string, unknown>) => unknown>([
    ["stats", () => host.report({
      kind: "stats",
      ticks,
      clockText: clock.current?.text ?? "",
      messageText: message.current?.text ?? ""
    })],
    ["run", command => run(String(command["name"]))],
    ["timers", command => measureTimers(Number(command["delay"]))],
    ["animate", command => {
      isAnimating = command["isOn"] === true;
    }],
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
  title="Loop example"
  width={WINDOW_WIDTH}
>
  <StackPanel>
    <TextBlock {@attach clock.attach}>{ticks}</TextBlock>
    <TextBlock {@attach message.attach}>{messageText}</TextBlock>
  </StackPanel>
</Window>
