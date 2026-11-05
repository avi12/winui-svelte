<script lang="ts">
  import GearMenu from "./GearMenu.svelte";
  import GlyphButton from "./GlyphButton.svelte";
  import { PillColumn } from "./pill-view.ts";
  import { send, view } from "./view.svelte.ts";
  import { fade } from "svelte/transition";
  import { FontIcon, MenuFlyout, RadioMenuFlyoutItem, TextBlock } from "winui-svelte/components";

  const CHEVRON_SIZE = 10;
  const MIN_DISPLAYS_TO_PICK = 2;
  const STATUS_FADE_MILLISECONDS = 150;

  const facts = $derived.by(() => {
    if (view.isMuted) {
      return {
        hasDisplayPicker: view.displays.length >= MIN_DISPLAYS_TO_PICK,
        micGlyph: "MicOff",
        micLabel: "Unmute"
      } as const;
    }

    return {
      hasDisplayPicker: view.displays.length >= MIN_DISPLAYS_TO_PICK,
      micGlyph: "Microphone",
      micLabel: "Mute"
    } as const;
  });
</script>

{#snippet chevron()}
  {#if facts.hasDisplayPicker}
    <FontIcon fontSize={CHEVRON_SIZE} glyph="ChevronDown" />
  {/if}
{/snippet}

{#snippet displayPicker()}
  {#if facts.hasDisplayPicker}
    <MenuFlyout placement="Top">
      {#each view.displays as display (display.id)}
        <RadioMenuFlyoutItem
          groupName="displays"
          isChecked={display.id === view.sharedDisplay}
          onclick={() => send({
            kind: "share",
            displayId: display.id
          })}
          text={display.name}
        />
      {/each}
    </MenuFlyout>
  {/if}
{/snippet}

<!--
  The pill row: share, mic, status (fills the rest), gear, end. A grid with
  display: grid and a column per child; each child names its column with
  `gridColumn`, and centers itself (the translator cannot give a component
  the class that `align-items` would lower into)
-->
<grid class="pill">
  <GlyphButton
    column={PillColumn.share}
    flyout={displayPicker}
    glyph="TVMonitor"
    isActive={view.sharedDisplay !== null}
    label="Share"
    onpress={() => send({
      kind: "share",
      displayId: view.sharedDisplay ?? ""
    })}
    trailing={chevron}
  />
  <GlyphButton
    column={PillColumn.microphone}
    glyph={facts.micGlyph}
    isActive={view.isMuted}
    label={facts.micLabel}
    onpress={() => send({ kind: "mute" })}
  />

  <!--
    The status crossfades on change: the old text leaves while the new one
    enters, both in the same grid cell. Svelte's fade works on a raw element
    (API.md, Transitions), so each text is wrapped in a <border>.
    The tooltip carries the failure detail
  -->
  <grid class="status" gridColumn={PillColumn.status} toolTip={view.statusDetail} verticalAlignment="Center">
    {#key view.status}
      <border in:fade={{ duration: STATUS_FADE_MILLISECONDS }} out:fade={{ duration: STATUS_FADE_MILLISECONDS }}>
        <TextBlock class="status-text" textTrimming="CharacterEllipsis">{view.status}</TextBlock>
      </border>
    {/key}
  </grid>

  <GearMenu column={PillColumn.gear} />
  <GlyphButton column={PillColumn.end} glyph="Cancel" label="End (Win+C)" onpress={() => send({ kind: "end" })} />
</grid>

<style>
  .pill {
    display: grid;
    grid-template-columns: auto auto 1fr auto auto;
    height: 48px;
    padding: 0 8px;
    border-color: rgb(255 255 255 / 0.2);
    border-width: 1px;
    border-radius: 24px;
    background-color: rgb(27 27 31 / 0.9);
    column-gap: 4px;
  }

  .status {
    padding: 0 8px;
  }

  .status-text {
    font-size: 14px;
  }
</style>
