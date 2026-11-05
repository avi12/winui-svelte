<script lang="ts">
  import type { SettingsRowProps } from "./settings-props.ts";
  import FontIcon from "#src/components/generated/FontIcon.svelte";
  import Grid from "#src/components/generated/Grid.svelte";
  import StackPanel from "#src/components/generated/StackPanel.svelte";
  import TextBlock from "#src/components/generated/TextBlock.svelte";
  import { isSnippet } from "#src/components/runtime.js";
  import type { Snippet } from "svelte";

  // The row inside a settings card and the header of a settings expander: the
  // icon, the texts, the control and, after it, whatever the owner puts at the end.
  interface Props extends SettingsRowProps {
    end?: Snippet | undefined;
  }

  const props: Props = $props();
  const icon = $derived(props.headerIcon);
</script>

<Grid class="row">
  {#if isSnippet(icon)}
    <StackPanel class="icon">{@render icon()}</StackPanel>
  {:else if icon}
    <FontIcon class="icon glyph" glyph={icon} />
  {/if}
  <StackPanel class="texts">
    <TextBlock textWrapping="Wrap">{props.header}</TextBlock>
    {#if props.description}
      <TextBlock class="description" textWrapping="Wrap">{props.description}</TextBlock>
    {/if}
  </StackPanel>
  {#if props.children}
    <StackPanel class="content">{@render props.children()}</StackPanel>
  {/if}
  {#if props.end}
    <StackPanel class="end">{@render props.end()}</StackPanel>
  {/if}
</Grid>

<style>
  .row {
    grid-template-columns: auto 1fr auto auto;
    justify-self: stretch;
  }

  .icon {
    grid-column: 1;
    align-self: center;
    margin-right: 16px;
  }

  .glyph {
    font-size: 20px;
  }

  .texts {
    grid-column: 2;
    align-self: center;
  }

  .description {
    font-size: 12px;
    color: var(--text-fill-color-secondary);
  }

  .content {
    flex-direction: row;
    grid-column: 3;
    align-self: center;
    margin-left: 16px;
  }

  .end {
    flex-direction: row;
    grid-column: 4;
    align-self: center;
    margin-left: 16px;
  }
</style>
