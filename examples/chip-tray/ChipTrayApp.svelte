<script lang="ts">
  import type { ExampleCommand, ExampleHost } from "#examples/harness/contract.ts";
  import type { FrameworkElement } from "#winui/microsoft/ui/xaml/FrameworkElement";
  import { control } from "winui-svelte";
  import {
    Border,
    InlineUIContainer,
    Paragraph,
    RichTextBlock,
    StackPanel,
    TextBlock,
    VariableSizedWrapGrid,
    Window
  } from "winui-svelte/components";
  import { exitApplication } from "winui-svelte/window";

  const WINDOW_HEIGHT = 480;
  const WINDOW_WIDTH = 300;
  const CHIPS = ["Docs", "Release notes", "A", "Support forum", "Pricing", "Status page", "About us", "Contact"];

  interface Props {
    host: ExampleHost;
  }

  const { host }: Props = $props();
  let grid: FrameworkElement | undefined;
  let text: FrameworkElement | undefined;
  const gridChips: FrameworkElement[] = [];
  const textChips: FrameworkElement[] = [];

  function placesOf({ chips, container }: {
    chips: FrameworkElement[];
    container: FrameworkElement | undefined;
  }) {
    if (!container) {
      return [];
    }

    return chips.map(chip => {
      const point = chip.transformToVisual(container).transformPoint({
        x: 0,
        y: 0
      });
      return [Math.round(point.x), Math.round(point.y), Math.round(chip.actualWidth)];
    });
  }

  const commands = new Map<string, (command: ExampleCommand) => void>([
    ["stats", () => host.report({
      kind: "stats",
      gridHeight: grid?.actualHeight ?? 0,
      textHeight: text?.actualHeight ?? 0,
      gridChips: placesOf({
        chips: gridChips,
        container: grid
      }),
      textChips: placesOf({
        chips: textChips,
        container: text
      })
    })],
    ["close", () => exitApplication()]
  ]);
  // svelte-ignore state_referenced_locally
  host.onCommand(command => commands.get(String(command["cmd"]))?.(command));
</script>

<Window height={WINDOW_HEIGHT} onclosed={exitApplication} title="Chip tray example" width={WINDOW_WIDTH}>
  <StackPanel class="page">
    <VariableSizedWrapGrid
      {@attach control<FrameworkElement>(native => {
        grid = native;
      })}
      orientation="Horizontal"
    >
      {#each CHIPS as label (label)}
        <Border
          class="chip" {@attach control<FrameworkElement>(native => {
            gridChips.push(native);
          })}><TextBlock>{label}</TextBlock></Border>
      {/each}
    </VariableSizedWrapGrid>
    <RichTextBlock
      {@attach control<FrameworkElement>(native => {
        text = native;
      })}
    >
      <Paragraph>
        {#each CHIPS as label (label)}
          <InlineUIContainer><Border
            class="chip" {@attach control<FrameworkElement>(native => {
              textChips.push(native);
            })}><TextBlock>{label}</TextBlock></Border></InlineUIContainer>
        {/each}
      </Paragraph>
    </RichTextBlock>
  </StackPanel>
</Window>

<style>
  .page {
    gap: 16px;
    padding: 8px;
  }

  .chip {
    margin-right: 6px;
    margin-bottom: 6px;
    padding: 4px 10px;
  }
</style>
