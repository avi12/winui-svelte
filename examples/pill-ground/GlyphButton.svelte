<script lang="ts">
  import type { Snippet } from "svelte";
  import { Button, FontIcon } from "winui-svelte/components";
  import type { FluentGlyphName } from "winui-svelte/components";

  interface Props {
    glyph: FluentGlyphName;
    label: string;
    column: number;
    isActive?: boolean;
    onpress?: () => void;
    // Extra content after the glyph (the share button's chevron)
    trailing?: Snippet;
    // A flyout the click opens (the share button's display picker)
    flyout?: Snippet;
  }

  function ignoreClick() {}
  const ACTIVE_BACKGROUND = "#33ff5555";

  const props: Props = $props();

  const look = $derived.by(() => {
    const isActive = props.isActive === true;
    if (isActive) {
      return { background: ACTIVE_BACKGROUND };
    }

    return { background: "transparent" };
  });
</script>

<!--
  GAP: the pill uses Material Symbols Rounded (an embedded, subset font).
  A font is named by family (`fontFamily`), and no API that loads a font file
  from the app's folder was found, so the glyph below is Segoe Fluent Icons
  (part of Windows 11); for the same look the font must be installed on the
  machine, then named with `fontFamily="Material Symbols Rounded"`
-->
{#snippet content()}
  <stack-panel class="glyph-content">
    <FontIcon glyph={props.glyph} />
    {@render props.trailing?.()}
  </stack-panel>
{/snippet}

{#if props.flyout === undefined}
  <Button
    style:background-color={look.background}
    class="glyph-button"
    automationId={props.label}
    gridColumn={props.column}
    onclick={props.onpress ?? ignoreClick}
    toolTip={props.label}
    verticalAlignment="Center"
  >
    {@render content()}
  </Button>
{:else}
  <Button
    style:background-color={look.background}
    class="glyph-button"
    automationId={props.label}
    flyout={props.flyout}
    gridColumn={props.column}
    onclick={props.onpress ?? ignoreClick}
    toolTip={props.label}
    verticalAlignment="Center"
  >
    {@render content()}
  </Button>
{/if}

<style>
  .glyph-content {
    display: flex;
    flex-direction: row;
    gap: 4px;
  }

  .glyph-button {
    min-width: 36px;
    height: 36px;
    padding: 0 8px;
    border-width: 0;
  }
</style>
