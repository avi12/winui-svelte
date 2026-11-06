<script lang="ts">
  import type { ExampleHost } from "#examples/harness/contract.ts";
  import type { FrameworkElement } from "#winui/microsoft/ui/xaml/FrameworkElement";
  import { elementRef } from "winui-svelte";
  import { Border, Grid, Window } from "winui-svelte/components";
  import { exitApplication } from "winui-svelte/window";

  const WINDOW_HEIGHT = 300;
  const WINDOW_WIDTH = 600;
  const { host }: { host: ExampleHost } = $props();
  const stage = elementRef<FrameworkElement>();

  // svelte-ignore state_referenced_locally
  host.onCommand(command => {
    const isStats = command["cmd"] === "stats";
    if (isStats) {
      host.report({
        kind: "stats",
        scale: stage.current?.xamlRoot?.rasterizationScale ?? 1
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
  title="Shadows example"
  width={WINDOW_WIDTH}
>
  <Grid class="sh-stage" {@attach stage.attach}>
    <Border class="sh-card sh-hard" />
    <Border class="sh-card sh-blur" />
    <Border class="sh-card sh-ring" />
    <Border class="sh-card sh-lifted" />
  </Grid>
</Window>

<style>
  .sh-stage {
    grid-template-columns: 1fr 1fr 1fr 1fr;
    width: 600px;
    height: 300px;
    background-color: #dce6f0;
    -winui-shadow-receiver: sh-surface;
  }

  .sh-card {
    align-self: center;
    justify-self: center;
    width: 100px;
    height: 100px;
    background-color: #ffffff;
  }

  .sh-hard {
    grid-column: 1;
    box-shadow: 16px 16px 0 #ff0000;
    -winui-shadow: composition;
  }

  .sh-blur {
    grid-column: 2;
    box-shadow: 0 10px 20px #0000ff;
    -winui-shadow: composition;
  }

  .sh-ring {
    grid-column: 3;
    box-shadow: 0 0 0 8px #00aa00;
    -winui-shadow: composition;
  }

  .sh-lifted {
    grid-column: 4;
    -winui-elevation: 32px;
    -winui-shadow-cast-on: sh-surface;
  }
</style>
