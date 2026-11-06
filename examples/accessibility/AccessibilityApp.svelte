<script lang="ts">
  import DemoForm from "./DemoForm.svelte";
  import type { ExampleCommand, ExampleHost } from "#examples/harness/contract.ts";
  import type { StackPanel as StackPanelControl } from "#winui/microsoft/ui/xaml/controls/StackPanel";
  import type { TextBlock as TextBlockControl } from "#winui/microsoft/ui/xaml/controls/TextBlock";
  import { elementRef } from "winui-svelte";
  import { announce, LivePriority, liveRegion } from "winui-svelte/accessibility";
  import { auditAccessibility } from "winui-svelte/accessibility/audit";
  import { StackPanel, TextBlock, Window } from "winui-svelte/components";
  import { exitApplication } from "winui-svelte/window";

  const WINDOW_HEIGHT = 420;
  const WINDOW_WIDTH = 420;

  interface Props {
    host: ExampleHost;
  }

  const { host }: Props = $props();
  const failing = elementRef<StackPanelControl>();
  const fixed = elementRef<StackPanelControl>();
  const status = elementRef<TextBlockControl>();

  function ruleIdsOf(root: typeof failing) {
    const { current } = root;
    return current === undefined ? [] : auditAccessibility(current).map(finding => finding.ruleId);
  }

  function priorityOf(name: unknown) {
    return name === LivePriority.ASSERTIVE ? LivePriority.ASSERTIVE : LivePriority.POLITE;
  }

  const commands = new Map<string, (command: ExampleCommand) => void>([
    ["audit", () => host.report({
      kind: "audit",
      failing: ruleIdsOf(failing),
      fixed: ruleIdsOf(fixed)
    })],
    ["announce", command => {
      const { current } = status;
      const isRootMade = current !== undefined;
      if (isRootMade) {
        announce({
          message: String(command["message"]),
          priority: priorityOf(command["priority"]),
          element: current
        });
      }

      host.report({ kind: "announced" });
    }],
    ["close", () => exitApplication()]
  ]);
  // svelte-ignore state_referenced_locally
  host.onCommand(command => commands.get(String(command["cmd"]))?.(command));
</script>

<Window
  height={WINDOW_HEIGHT}
  onclosed={exitApplication}
  placement={{
    x: -8000,
    y: 0
  }}
  title="Accessibility example"
  width={WINDOW_WIDTH}
>
  <StackPanel>
    <DemoForm isFixed={false} root={failing} />
    <DemoForm isFixed={true} root={fixed} />
    <TextBlock {@attach liveRegion()} {@attach status.attach}>Ready</TextBlock>
  </StackPanel>
</Window>
