<script lang="ts">
  import type { CounterView, ViewReport } from "./app-types.ts";
  import type { UIElement } from "#winui/microsoft/ui/xaml/UIElement";
  import { elementRef } from "winui-svelte";
  import { ComboBox, ComboBoxItem, StackPanel, TextBlock } from "winui-svelte/components";
  import type { HostState } from "winui-svelte/state";

  interface Props {
    view: HostState<CounterView>;
    report(message: ViewReport): void;
  }

  const { view, report }: Props = $props();
  const label = elementRef<UIElement>();

  $effect(() => {
    report({
      kind: "view",
      count: view.current?.count ?? null,
      isLabelled: label.current !== undefined
    });
  });
</script>

<StackPanel class={["production", "page"]}>
  <TextBlock {@attach label.attach}>count: {view.current?.count ?? "waiting"}</TextBlock>
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
