<script lang="ts">
  import type { ExampleCommand, ExampleHost } from "#examples/harness/contract.ts";
  import type { ScrollViewer } from "#winui/microsoft/ui/xaml/controls/ScrollViewer";
  import { elementRef } from "winui-svelte";
  import {
    Border,
    Grid,
    ScrollViewer as ScrollViewerControl,
    StackPanel,
    Window
  } from "winui-svelte/components";
  import { exitApplication } from "winui-svelte/window";

  const WINDOW_HEIGHT = 360;
  const WINDOW_WIDTH = 480;

  interface Props {
    // The harness's, handed over once: it never changes.
    host: ExampleHost;
  }

  const { host }: Props = $props();
  const scroller = elementRef<ScrollViewer>();

  const commands = new Map<string, (command: ExampleCommand) => void>([
    ["stats", () => host.report({
      kind: "stats",
      scale: scroller.current?.xamlRoot?.rasterizationScale ?? 1
    })],
    ["scroll", command => {
      scroller.current?.changeView(null, Number(command["offset"]), null, true);
      host.report({
        kind: "scroll",
        offset: Number(command["offset"])
      });
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
  title="Scroll timeline example"
  width={WINDOW_WIDTH}
>
  <Grid class="st-stage">
    <ScrollViewerControl class="st-scroller" {@attach scroller.attach}>
      <StackPanel>
        <Border class="st-gap" />
        <Border class="st-frame">
          <Border class="st-hero" />
        </Border>
        <Border class="st-tail" />
      </StackPanel>
    </ScrollViewerControl>
    <Border class="st-header" />
    <Border class="st-rail" />
  </Grid>
</Window>

<style>
  .st-stage {
    width: 480px;
    height: 330px;
    background-color: #336699;
  }

  /* The scroll viewer defines the timeline the header, a sibling, is linked to. */
  .st-scroller {
    scroll-timeline: --page block;
  }

  .st-gap {
    height: 260px;
  }

  .st-frame {
    height: 220px;
    background-color: #1c3a5e;
  }

  .st-tail {
    height: 1400px;
  }

  /* The header collapses as the page scrolls its first 400 pixels. */
  .st-header {
    align-self: start;
    justify-self: center;
    width: 280px;
    height: 80px;
    margin-top: 20px;
    background-color: #ff0000;
    animation: collapse linear both;
    animation-timeline: --page;
    animation-range: 0px 400px;
  }

  @keyframes collapse {
    from {
      opacity: 1;
      translate: 0 0;
      scale: 1 1;
    }

    to {
      opacity: 0;
      translate: 0 -30px;
      scale: 1 0.5;
    }
  }

  /* The hero card drifts against the scroll while it crosses the viewport: a parallax. */
  .st-hero {
    align-self: center;
    justify-self: center;
    width: 200px;
    height: 120px;
    margin: 50px;
    background-color: #f2c14e;
    animation: drift linear both view();
  }

  @keyframes drift {
    from {
      translate: 0 -40px;
    }

    to {
      translate: 0 40px;
    }
  }

  /* A strip in the stage's own color, so a test finds where the content starts whatever the scroll offset. */
  .st-rail {
    justify-self: start;
    width: 6px;
    background-color: #336699;
  }
</style>
