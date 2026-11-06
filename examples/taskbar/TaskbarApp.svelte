<script lang="ts">
  import type { ExampleCommand, ExampleHost } from "#examples/harness/contract.ts";
  import {
    Button,
    ProgressBar,
    StackPanel,
    TextBlock,
    Window
  } from "winui-svelte/components";
  import type { WindowHandle } from "winui-svelte/components";
  import { installBadging } from "winui-svelte/web-apis/badging";
  import { exitApplication, startTimer } from "winui-svelte/window";
  import { taskbarBadgeBackend, TaskbarProgressState } from "winui-svelte/window/taskbar";

  const WINDOW_WIDTH = 420;
  const WINDOW_HEIGHT = 300;
  const TICK_MILLISECONDS = 200;
  const STEP = 0.04;
  const FULL = 1;
  const PERCENT = 100;

  const { host }: { host: ExampleHost } = $props();

  let handle: WindowHandle | undefined = $state();
  let progress = $state(0);
  let progressState = $state<TaskbarProgressState>(TaskbarProgressState.NONE);
  let unread = $state(0);
  let stopTimer: (() => void) | undefined;
  let uninstallBadging: (() => void) | undefined;

  function requireWindow() {
    const current = handle;
    const isOpen = current !== undefined;
    if (!isOpen) {
      throw new Error("the window has not opened");
    }

    return current;
  }

  function show(next: TaskbarProgressState) {
    progressState = next;
    requireWindow().taskbar.setProgress({
      state: next,
      value: progress
    });
  }

  function stopDownload() {
    stopTimer?.();
    stopTimer = undefined;
  }

  function finish() {
    stopDownload();
    show(TaskbarProgressState.NONE);
    requireWindow().taskbar.flash({ count: 2 });
  }

  function tick() {
    progress = Math.min(FULL, progress + STEP);
    const isDone = progress >= FULL;
    if (isDone) {
      finish();
      return;
    }

    show(TaskbarProgressState.NORMAL);
  }

  function startDownload() {
    stopDownload();
    progress = 0;
    show(TaskbarProgressState.INDETERMINATE);
    stopTimer = startTimer({
      milliseconds: TICK_MILLISECONDS,
      onTick: tick
    });
  }

  function failDownload() {
    stopDownload();
    show(TaskbarProgressState.ERROR);
  }

  function setUnread(count: number) {
    unread = Math.max(0, count);
    return navigator.setAppBadge(unread);
  }

  function installBadge() {
    uninstallBadging ??= installBadging({ fallback: taskbarBadgeBackend(requireWindow().taskbar) });
  }

  async function run(action: () => unknown) {
    try {
      await action();
      host.report({
        kind: "done",
        error: null,
        state: progressState,
        progress,
        unread
      });
    } catch (error) {
      host.report({
        kind: "done",
        error: error instanceof Error ? error.message : String(error)
      });
    }
  }

  const commands = new Map<string, (command: ExampleCommand) => unknown>([
    ["progress", command => {
      progress = Number(command["value"]);
      const next = Object.values(TaskbarProgressState).find(candidate => candidate === command["state"]);
      show(next ?? TaskbarProgressState.NONE);
    }],
    ["badge", command => {
      installBadge();
      return setUnread(Number(command["count"]));
    }],
    ["overlay", command => requireWindow().taskbar.setOverlayBadge({ count: Number(command["count"]) })],
    ["clearOverlay", () => requireWindow().taskbar.clearOverlay()],
    ["flash", command => requireWindow().taskbar.flash({ count: Number(command["count"]) })],
    ["stopFlashing", () => requireWindow().taskbar.stopFlashing()],
    ["close", () => exitApplication()]
  ]);
  // svelte-ignore state_referenced_locally
  host.onCommand(command => {
    const action = commands.get(String(command["cmd"]));
    if (!action) {
      return;
    }

    void run(() => action(command));
  });
</script>

<Window height={WINDOW_HEIGHT} onclosed={exitApplication} title="Taskbar example" width={WINDOW_WIDTH} bind:handle>
  <StackPanel class="page">
    <TextBlock class="heading">Download {Math.round(progress * PERCENT)}% ({progressState})</TextBlock>
    <ProgressBar maximum={FULL} value={progress} />
    <StackPanel class="row">
      <Button onclick={startDownload}>Start</Button>
      <Button onclick={failDownload}>Fail</Button>
    </StackPanel>
    <TextBlock class="heading">Unread: {unread}</TextBlock>
    <StackPanel class="row">
      <Button
        onclick={() => {
          installBadge();
          void setUnread(unread + 1);
        }}
      >
        New message
      </Button>
      <Button
        onclick={() => {
          installBadge();
          void setUnread(0);
        }}
      >
        Read all
      </Button>
    </StackPanel>
  </StackPanel>
</Window>

<style>
  .page {
    gap: 12px;
    padding: 24px;
  }

  .row {
    flex-direction: row;
    gap: 8px;
  }

  .heading {
    font-size: 18px;
  }
</style>
