<script lang="ts">
  import type { ExampleCommand, ExampleHost } from "#examples/harness/contract.ts";
  import { AutomationProperties } from "#winui/microsoft/ui/xaml/automation/AutomationProperties";
  import type { FrameworkElement } from "#winui/microsoft/ui/xaml/FrameworkElement";
  import { VisualTreeHelper } from "#winui/microsoft/ui/xaml/media/VisualTreeHelper";
  import { elementRef } from "winui-svelte";
  import { StackPanel, ToggleSwitch, Window } from "winui-svelte/components";
  import { SettingsCard, SettingsExpander } from "winui-svelte/settings";
  import { exitApplication } from "winui-svelte/window";

  const WINDOW_HEIGHT = 500;
  const WINDOW_WIDTH = 560;

  interface Props {
    host: ExampleHost;
  }

  const { host }: Props = $props();
  const plain = elementRef<FrameworkElement>();
  const clickable = elementRef<FrameworkElement>();
  const inner = elementRef<FrameworkElement>();
  let isExpanded = $state(false);
  let clicks = $state(0);

  function measure(element: FrameworkElement | undefined) {
    return {
      height: element?.actualHeight ?? 0,
      width: element?.actualWidth ?? 0
    };
  }

  // The card is the first child of the panel the example puts it in.
  function automationOf(holder: FrameworkElement | undefined) {
    const isMissing = holder === undefined;
    if (isMissing) {
      return {
        name: null,
        help: null
      };
    }

    const card = VisualTreeHelper.getChild(holder, 0);
    return {
      name: AutomationProperties.getName(card),
      help: AutomationProperties.getHelpText(card)
    };
  }

  const commands = new Map<string, (command: ExampleCommand) => void>([
    ["stats", () => host.report({
      kind: "stats",
      plain: measure(plain.current),
      clickable: measure(clickable.current),
      inner: measure(inner.current),
      clickableName: automationOf(clickable.current).name,
      clickableHelp: automationOf(clickable.current).help,
      isExpanded,
      clicks
    })],
    ["expand", () => {
      isExpanded = true;
      host.report({ kind: "expanded" });
    }],
    ["close", () => exitApplication()]
  ]);
  // svelte-ignore state_referenced_locally
  host.onCommand(command => commands.get(String(command["cmd"]))?.(command));
</script>

<Window height={WINDOW_HEIGHT} onclosed={exitApplication} title="Settings cards example" width={WINDOW_WIDTH}>
  <StackPanel>
    <StackPanel {@attach plain.attach}>
      <SettingsCard description="Start with Windows" header="Run at startup" headerIcon="PowerButton">
        <ToggleSwitch />
      </SettingsCard>
    </StackPanel>
    <StackPanel {@attach clickable.attach}>
      <SettingsCard
        description="Opens the log folder"
        header="Open the logs"
        isClickEnabled
        onclick={() => {
          clicks++;
        }}
      />
    </StackPanel>
    <SettingsExpander description="Colors and text" header="Appearance" bind:isExpanded>
      {#snippet items()}
        <StackPanel {@attach inner.attach}>
          <SettingsCard header="Theme" />
        </StackPanel>
      {/snippet}
    </SettingsExpander>
  </StackPanel>
</Window>
