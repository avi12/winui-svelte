<script lang="ts">
  import type { ExampleHost } from "#examples/harness/contract.ts";
  import { projectAs } from "#winui/lifetime";
  import type { Button as NativeButton } from "#winui/microsoft/ui/xaml/controls/Button";
  import { ContentPresenter } from "#winui/microsoft/ui/xaml/controls/ContentPresenter";
  import { FrameworkElement } from "#winui/microsoft/ui/xaml/FrameworkElement";
  import { SolidColorBrush } from "#winui/microsoft/ui/xaml/media/SolidColorBrush";
  import { VisualTreeHelper } from "#winui/microsoft/ui/xaml/media/VisualTreeHelper";
  import { elementRef } from "winui-svelte";
  import { goToState, StackPanel, TextBlock, Window } from "winui-svelte/components";
  import { exitApplication } from "winui-svelte/window";

  const WINDOW_HEIGHT = 360;
  const WINDOW_WIDTH = 420;
  const HEX_RADIX = 16;
  const STACK_SPACING = 16;
  const CARD_SPACING = 4;
  const STATES = ["Normal", "PointerOver", "Pressed", "Disabled"];
  const { host }: { host: ExampleHost } = $props();
  const cta = elementRef<NativeButton>();
  const card = elementRef<NativeButton>();

  function hex(value: number) {
    return value.toString(HEX_RADIX).padStart(2, "0");
  }

  // The brush the button's template part is drawn with while it is in a state.
  function brushIn({ button, name, property = "background" }: {
    button: NativeButton;
    name: string;
    property?: "background" | "borderBrush";
  }) {
    goToState({
      control: button,
      name
    });
    const root = projectAs(VisualTreeHelper.getChild(button, 0), FrameworkElement);
    const part = projectAs(root.findName("ContentPresenter"), ContentPresenter);
    const { color } = projectAs(part[property], SolidColorBrush);
    return `#${hex(color.r)}${hex(color.g)}${hex(color.b)}`;
  }

  // svelte-ignore state_referenced_locally
  host.onCommand(command => {
    const isStats = command["cmd"] === "stats";
    if (isStats) {
      const buttons = {
        cta: cta.current,
        card: card.current
      };
      host.report({
        kind: "stats",
        ...Object.fromEntries(
          Object.entries(buttons).flatMap(([label, button]) => (button === undefined ? [] : STATES.map(name => [`${label}${name}`, brushIn({
            button,
            name
          })])))
        ),
        cardPressedBorder: card.current === undefined ? "" : brushIn({
          button: card.current,
          name: "Pressed",
          property: "borderBrush"
        })
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
  title="Visual states example"
  width={WINDOW_WIDTH}
>
  <StackPanel spacing={STACK_SPACING}>
    <button class="cta" {@attach cta.attach}>Save</button>
    <button class="card" {@attach card.attach}>
      <StackPanel spacing={CARD_SPACING}>
        <TextBlock class="card-title">Weekly report</TextBlock>
        <TextBlock class="card-body">Hover, press or disable the card</TextBlock>
      </StackPanel>
    </button>
    <button class="cta" disabled>Disabled</button>
  </StackPanel>
</Window>

<style>
  .cta {
    background-color: #0a6cff;
    color: #ffffff;
  }

  .cta:hover {
    background-color: #0050c8;
  }

  .cta:active {
    background-color: #003a8f;
    color: #e0e8ff;
  }

  .cta:disabled {
    background-color: #888888;
  }

  .card {
    padding: 16px;
    border-color: #cccccc;
    border-width: 1px;
    background-color: #ffffff;
  }

  .card:hover {
    border-color: #0a6cff;
    background-color: #eef4ff;
  }

  .card:active {
    border-color: var(--text-fill-color-primary-brush);
    background-color: #dbe7ff;
  }

  .card:disabled {
    background-color: #eeeeee;
  }
</style>
