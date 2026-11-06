<script lang="ts">
  import DemoForm from "#examples/accessibility/DemoForm.svelte";
  import PageFrame from "#examples/gallery/PageFrame.svelte";
  import { keyControl } from "#examples/harness/smoke.ts";
  import type { StackPanel as StackPanelControl } from "#winui/microsoft/ui/xaml/controls/StackPanel";
  import type { TextBlock as TextBlockControl } from "#winui/microsoft/ui/xaml/controls/TextBlock";
  import { elementRef } from "winui-svelte";
  import { announce, LivePriority, liveRegion } from "winui-svelte/accessibility";
  import { auditAccessibility } from "winui-svelte/accessibility/audit";
  import { Button, StackPanel, TextBlock } from "winui-svelte/components";

  const failing = elementRef<StackPanelControl>();
  const fixed = elementRef<StackPanelControl>();
  const status = elementRef<TextBlockControl>();
  let statusText = $state("Ready");
  let findings = $state<string[]>([]);

  function findingsOf(root: typeof failing) {
    const { current } = root;
    return current === undefined ? [] : auditAccessibility(current);
  }

  function audit() {
    const failingFindings = findingsOf(failing);
    findings = [
      `Failing form: ${failingFindings.length} findings`,
      ...failingFindings.map(finding => `${finding.ruleId}: ${finding.suggestion}`),
      `Fixed form: ${findingsOf(fixed).length} findings`
    ];
  }

  function save() {
    statusText = "Saved";
    const { current } = status;
    const isStatusMade = current !== undefined;
    if (isStatusMade) {
      announce({
        message: "Saved to your account",
        priority: LivePriority.POLITE,
        element: current
      });
    }
  }
</script>

<PageFrame
  caption="The audit reads the live window the way a screen reader does: the left form has an input with no label, an icon-only button with no name and pale text; the right one is fixed. Saving says so to Narrator."
  title="Live regions and the audit"
>
  <StackPanel class="live-block" {@attach keyControl("accessibility-live")}>
    <DemoForm isFixed={false} root={failing} />
    <DemoForm isFixed={true} root={fixed} />
    <Button onclick={audit}>Audit both forms</Button>
    {#each findings as line (line)}
      <TextBlock>{line}</TextBlock>
    {/each}
    <Button onclick={save}>Save and announce</Button>
    <TextBlock {@attach liveRegion()} {@attach status.attach}>{statusText}</TextBlock>
  </StackPanel>
</PageFrame>

<style>
  .live-block {
    gap: 8px;
  }
</style>
