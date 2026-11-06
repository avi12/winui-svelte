<script lang="ts">
  import type { ExampleHost } from "#examples/harness/contract.ts";
  import type { TextBlock as NativeTextBlock } from "#winui/microsoft/ui/xaml/controls/TextBlock";
  import { elementRef } from "winui-svelte";
  import { StackPanel, TextBlock, Window } from "winui-svelte/components";
  import { exitApplication } from "winui-svelte/window";

  const WINDOW_HEIGHT = 640;
  const WINDOW_WIDTH = 520;
  const RAMP = ["caption", "body", "body-strong", "body-large", "subtitle", "title", "title-large", "display"];
  const { host }: { host: ExampleHost } = $props();
  const plain = elementRef<NativeTextBlock>();
  const smallCaps = elementRef<NativeTextBlock>();
  const feature = elementRef<NativeTextBlock>();
  const body = elementRef<NativeTextBlock>();
  const title = elementRef<NativeTextBlock>();

  // svelte-ignore state_referenced_locally
  host.onCommand(command => {
    const isStats = command["cmd"] === "stats";
    if (isStats) {
      host.report({
        kind: "stats",
        plain: plain.current?.actualWidth ?? 0,
        smallCaps: smallCaps.current?.actualWidth ?? 0,
        feature: feature.current?.actualWidth ?? 0,
        body: body.current?.actualHeight ?? 0,
        title: title.current?.actualHeight ?? 0
      });
    }

    const isClose = command["cmd"] === "close";
    if (isClose) {
      exitApplication();
    }
  });
</script>

<Window
  activate={false}
  height={WINDOW_HEIGHT}
  onclosed={exitApplication}
  placement={{
    x: -8000,
    y: 0
  }}
  title="Typography example"
  width={WINDOW_WIDTH}
>
  <StackPanel>
    <TextBlock class="face ramp-body" {@attach body.attach}>The type ramp</TextBlock>
    <TextBlock class="face ramp-title" {@attach title.attach}>Title</TextBlock>
    <TextBlock class="face ramp-caption">Caption, {RAMP.length} steps in all</TextBlock>
    <TextBlock class="face plain" {@attach plain.attach}>Quick Brown Fox 0123456789</TextBlock>
    <TextBlock class="face small-caps" {@attach smallCaps.attach}>Quick Brown Fox 0123456789</TextBlock>
    <TextBlock class="face oldstyle">Quick Brown Fox 0123456789</TextBlock>
    <TextBlock class="face stylistic-set">Quick Brown Fox 0123456789</TextBlock>
    <TextBlock class="face feature" {@attach feature.attach}>Quick Brown Fox 0123456789</TextBlock>
  </StackPanel>
</Window>

<style>
  .face {
    font-family: Calibri;
    font-size: 24px;
  }

  .ramp-body {
    font: var(--type-body);
  }

  .ramp-title {
    font: var(--type-title);
  }

  .ramp-caption {
    font: var(--type-caption);
  }

  .small-caps {
    font-variant-caps: small-caps;
  }

  .oldstyle {
    font-variant-numeric: oldstyle-nums tabular-nums;
  }

  .stylistic-set {
    font-family: Gabriola;
    font-feature-settings: "ss06", "salt" 2;
  }

  .feature {
    font-feature-settings: "smcp", "onum", "liga" 0;
  }
</style>
