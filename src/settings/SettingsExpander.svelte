<script lang="ts">
  import { provideExpander } from "./settings-context.ts";
  import type { SettingsExpanderProps } from "./settings-props.ts";
  import SettingsRow from "./SettingsRow.svelte";
  import Expander from "#src/components/generated/Expander.svelte";
  import StackPanel from "#src/components/generated/StackPanel.svelte";

  // A settings card that opens. The header is a card row inside WinUI's
  // Expander, whose own chevron is the action; the items go in its content, and
  // the SettingsCards among them know they are inside and draw flat.
  let { isExpanded = $bindable(false), ...props }: SettingsExpanderProps = $props();
  provideExpander();
</script>

{#snippet header()}
  <SettingsRow description={props.description} header={props.header} headerIcon={props.headerIcon}>
    {@render props.children?.()}
  </SettingsRow>
{/snippet}

<Expander
  class="expander"
  automationId={props.automationId ?? ""}
  automationName={props.header}
  {header}
  horizontalContentAlignment="Stretch"
  bind:isExpanded
>
  <StackPanel class="items">{@render props.items?.()}</StackPanel>
</Expander>

<style>
  .expander {
    justify-self: stretch;
    min-height: 68px;
    padding: 0;
    border-color: var(--card-stroke-color-default);
    border-width: 1px;
    border-radius: 4px;
    background-color: var(--card-background-fill-color-default);
  }

  .items {
    justify-self: stretch;
  }
</style>
