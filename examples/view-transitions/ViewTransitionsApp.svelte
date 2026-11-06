<script lang="ts">
  import type { ExampleCommand, ExampleHost } from "#examples/harness/contract.ts";
  import type { FrameworkElement } from "#winui/microsoft/ui/xaml/FrameworkElement";
  import { ConnectedAnimationService } from "#winui/microsoft/ui/xaml/media/animation/ConnectedAnimationService";
  import { elementRef } from "winui-svelte";
  import {
    Border,
    Button,
    Grid,
    StackPanel,
    TextBlock,
    Window
  } from "winui-svelte/components";
  import { ConnectedAnimationKind } from "winui-svelte/enums";
  import { exitApplication } from "winui-svelte/window";

  const WINDOW_HEIGHT = 420;
  const WINDOW_WIDTH = 360;
  // Slower than WinUI's default, so the flight is easy to follow (and to time in the test).
  const FLIGHT_MILLISECONDS = 800;
  const TICKS_PER_MILLISECOND = 10_000n;

  interface Photo {
    readonly id: number;
    readonly title: string;
    readonly color: string;
  }

  interface Props {
    host: ExampleHost;
  }

  const PHOTOS: readonly Photo[] = [
    {
      id: 1,
      title: "Harbour",
      color: "#ff0000"
    },
    {
      id: 2,
      title: "Meadow",
      color: "#00ff00"
    },
    {
      id: 3,
      title: "Glacier",
      color: "#0000ff"
    }
  ];

  const { host }: Props = $props();
  const stage = elementRef<FrameworkElement>();
  let selected = $state<Photo | null>(null);

  // Opens a photo (or goes back to the list with null) as a view transition,
  // and reports how it went: whether it started and how long it flew.
  async function show(photo: Photo | null) {
    ConnectedAnimationService.getForCurrentView().defaultDuration = {
      duration: BigInt(FLIGHT_MILLISECONDS) * TICKS_PER_MILLISECOND
    };
    const transition = document.startViewTransition({
      update() {
        selected = photo;
      },
      ...photo === null ? { configuration: ConnectedAnimationKind.DIRECT } : {}
    });
    const isReady = await transition.ready.then(() => true, () => false);
    const readyAt = performance.now();
    await transition.finished;
    host.report({
      kind: "transitioned",
      isReady,
      flightMilliseconds: performance.now() - readyAt
    });
  }

  const commands = new Map<string, (command: ExampleCommand) => void>([
    ["stats", () => host.report({
      kind: "stats",
      scale: stage.current?.xamlRoot?.rasterizationScale ?? 1
    })],
    ["open", command => {
      void show(PHOTOS.find(photo => photo.id === Number(command["id"])) ?? null);
    }],
    ["back", () => {
      void show(null);
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
  title="View transitions example"
  width={WINDOW_WIDTH}
>
  <Grid class="vt-stage" {@attach stage.attach}>
    {#if selected}
      <StackPanel class="vt-detail">
        <Border
          style="background-color: {selected.color}; view-transition-name: photo-{selected.id};"
          class="vt-hero"
        />
        <TextBlock class="vt-title" text={selected.title} />
        <Button content="Back" onclick={() => void show(null)} />
      </StackPanel>
    {:else}
      <StackPanel class="vt-list">
        {#each PHOTOS as photo (photo.id)}
          <Button class="vt-row" onclick={() => void show(photo)}>
            <StackPanel orientation="Horizontal">
              <Border
                style="background-color: {photo.color}; view-transition-name: photo-{photo.id};"
                class="vt-thumbnail"
              />
              <TextBlock class="vt-caption" text={photo.title} />
            </StackPanel>
          </Button>
        {/each}
      </StackPanel>
    {/if}
  </Grid>
</Window>

<style>
  .vt-stage {
    width: 360px;
    height: 390px;
    background-color: #336699;
  }

  .vt-list {
    gap: 8px;
    margin: 16px;
  }

  .vt-thumbnail {
    width: 48px;
    height: 48px;
  }

  .vt-caption {
    align-self: center;
    margin-left: 12px;
  }

  .vt-detail {
    gap: 12px;
    margin: 16px;
  }

  .vt-hero {
    height: 220px;
  }

  .vt-title {
    font-size: 20px;
  }
</style>
