<script lang="ts">
  import { placementOf } from "./settings-context.ts";
  import { DEFAULT_ACTION_GLYPH } from "./settings-props.ts";
  import type { SettingsCardProps } from "./settings-props.ts";
  import SettingsRow from "./SettingsRow.svelte";
  import Border from "#src/components/generated/Border.svelte";
  import Button from "#src/components/generated/Button.svelte";
  import FontIcon from "#src/components/generated/FontIcon.svelte";

  // One setting as a Fluent card. A card that can be clicked is a Button, so it
  // takes focus and answers Enter and Space with no code here; one that cannot is
  // a Border. Inside a SettingsExpander it draws flat, as the toolkit's does.
  const props: SettingsCardProps = $props();
  const placement = placementOf();
  const kind = $derived({ isClickable: props.isClickEnabled === true });
</script>

{#snippet actionIcon()}
  <FontIcon class="chevron" glyph={props.actionIcon ?? DEFAULT_ACTION_GLYPH} />
{/snippet}

{#snippet row()}
  <SettingsRow
    description={props.description}
    end={kind.isClickable ? props.action ?? actionIcon : props.action}
    header={props.header}
    headerIcon={props.headerIcon}
  >
    {@render props.children?.()}
  </SettingsRow>
{/snippet}

{#if kind.isClickable}
  <Button
    class="card clickable"
    class:flat={placement.isInside}
    automationHelpText={props.description ?? ""}
    automationId={props.automationId ?? ""}
    automationName={props.header}
    isEnabled={props.isEnabled !== false}
    onclick={() => props.onclick?.()}
  >
    {@render row()}
  </Button>
{:else}
  <Border
    class="card"
    class:flat={placement.isInside}
    automationId={props.automationId ?? ""}
    automationName={props.header}
  >
    {@render row()}
  </Border>
{/if}

<style>
  .card {
    justify-self: stretch;
    min-height: 68px;
    padding: 12px 16px;
    border-color: var(--card-stroke-color-default);
    border-width: 1px;
    border-radius: 4px;
    background-color: var(--card-background-fill-color-default);
  }

  .clickable {
    justify-content: stretch;
  }

  .flat {
    border-width: 0;
    border-radius: 0;
    background-color: var(--card-background-fill-color-secondary);
  }

  .chevron {
    font-size: 12px;
  }
</style>
