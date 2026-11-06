<script lang="ts">
  import type { ExampleCommand, ExampleHost } from "#examples/harness/contract.ts";
  import { projectAs, releaseProjected } from "#winui/lifetime";
  import type { Border as BorderControl } from "#winui/microsoft/ui/xaml/controls/Border";
  import { PointerRoutedEventArgs } from "#winui/microsoft/ui/xaml/input/PointerRoutedEventArgs";
  import { elementRef } from "winui-svelte";
  import { Border, Grid, Window } from "winui-svelte/components";
  import { compositorAnimation, vector3Spring, visualReference } from "winui-svelte/composition";
  import { exitApplication } from "winui-svelte/window";

  const WINDOW_HEIGHT = 360;
  const WINDOW_WIDTH = 480;
  const CARD_CENTER = 60;
  const DAMPING_RATIO = 0.45;
  const PERIOD_MILLISECONDS = 70;
  const FOLLOW_SHARE = 0.5;

  interface Props {
    // The harness's, handed over once: it never changes.
    host: ExampleHost;
  }

  const { host }: Props = $props();
  const leader = elementRef<BorderControl>();
  let target = $state({
    x: 0,
    y: 0,
    z: 0
  });

  const commands = new Map<string, (command: ExampleCommand) => void>([
    ["stats", () => host.report({
      kind: "stats",
      scale: leader.current?.xamlRoot?.rasterizationScale ?? 1
    })],
    ["move", command => {
      target = {
        x: Number(command["x"]),
        y: Number(command["y"]),
        z: 0
      };
      host.report({
        kind: "move",
        ...target
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
  title="Composition example"
  width={WINDOW_WIDTH}
>
  <!-- The card springs to where the pointer is; the second card follows it at half the distance, on the compositor. -->
  <Grid
    class="co-stage"
    onpointermoved={(sender, args) => {
      const pointer = projectAs(args, PointerRoutedEventArgs);
      const { position } = pointer.getCurrentPoint(sender);
      releaseProjected(pointer);
      target = {
        x: position.x - CARD_CENTER,
        y: position.y - CARD_CENTER,
        z: 0
      };
    }}
  >
    <Border
      class="co-leader"
      {@attach leader.attach}
      {@attach compositorAnimation({
        property: "translation",
        animation: vector3Spring({
          finalValue: target,
          dampingRatio: DAMPING_RATIO,
          period: PERIOD_MILLISECONDS
        })
      })}
    />
    {#if leader.current}
      <Border
        class="co-follower"
        {@attach compositorAnimation({
          property: "translation",
          animation: visualReference(leader.current).translation.times(FOLLOW_SHARE)
        })}
      />
    {/if}
  </Grid>
</Window>

<style>
  .co-stage {
    width: 480px;
    height: 330px;
    background-color: #336699;
  }

  .co-leader {
    align-self: start;
    justify-self: start;
    width: 80px;
    height: 80px;
    margin-top: 20px;
    margin-left: 20px;
    background-color: #ff0000;
  }

  .co-follower {
    align-self: start;
    justify-self: start;
    width: 80px;
    height: 80px;
    margin-top: 140px;
    margin-left: 20px;
    background-color: #f2c14e;
  }
</style>
