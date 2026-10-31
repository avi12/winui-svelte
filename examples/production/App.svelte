<script lang="ts">
  import type { CounterView, ViewReport } from "./app-types.ts";
  import type { Button as ButtonControl } from "#winui/microsoft/ui/xaml/controls/Button";
  import type { UIElement } from "#winui/microsoft/ui/xaml/UIElement";
  import { boxed, elementRef } from "winui-svelte";
  import {
    Button,
    ComboBox,
    ComboBoxItem,
    StackPanel,
    TextBlock
  } from "winui-svelte/components";
  import type { HostState } from "winui-svelte/state";

  interface Props {
    view: HostState<CounterView>;
    report(message: ViewReport): void;
  }

  const { view, report }: Props = $props();
  const label = elementRef<UIElement>();
  const button = elementRef<ButtonControl>();
  const BUTTON_BACKGROUND = "#6b2fa0";

  $effect(() => {
    report({
      kind: "view",
      count: view.current?.count ?? null,
      isLabelled: label.current !== undefined,
      isResourceApplied: button.current?.resources.hasKey(boxed("ButtonBackground")) ?? false
    });
  });
</script>

<StackPanel class={["production", "page"]}>
  <TextBlock {@attach label.attach}>count: {view.current?.count ?? "waiting"}</TextBlock>
  <Button {@attach button.attach} resources={{ "--button-background": BUTTON_BACKGROUND }}>resourced</Button>
  <ComboBox automationLabeledBy={label.current} itemContainerStyle="production-row">
    <ComboBoxItem content="first" />
    <ComboBoxItem content="second" />
  </ComboBox>
</StackPanel>

<style>
  .production {
    gap: 8px;
    padding: 16px;
  }

  .production-row {
    padding: 12px;
  }
</style>
