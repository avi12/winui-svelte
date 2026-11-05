<script lang="ts">
  import ExtensionPanel from "./ExtensionPanel.svelte";
  import KeyPanel from "./KeyPanel.svelte";
  import Transcript from "./Transcript.svelte";
  import { view } from "./view.svelte.ts";
  import { fade, fly } from "svelte/transition";
  import { HyperlinkButton, StackPanel } from "winui-svelte/components";

  const RISE_PIXELS = 12;
  const RISE_MILLISECONDS = 200;

  const facts = $derived({
    isContentShown: view.lines.length > 0 || view.links.length > 0 || view.isKeyPromptShown || view.isExtensionNeeded
  });
</script>

<!--
  Shown only when it has content; enters with a 12 px rise (fly on a raw
  element, API.md "Transitions")
  GAP: "the height glides between sizes". Height is auto here, and a CSS
  transition or keyframe needs two numbers: measure the content with
  `ResizeObserver` (installObservers) and animate the card's height with
  `element.animate([{ height: from }, { height: to }])` (height is among the
  properties the animation engine reaches); no prop animates a layout change
  by itself
-->
{#if facts.isContentShown}
  <border
    class="card" in:fly={{
      y: RISE_PIXELS,
      duration: RISE_MILLISECONDS
    }} out:fade={{ duration: RISE_MILLISECONDS }}>
    <StackPanel class="card-content">
      <Transcript />

      <!--
        GAP: the chips should wrap onto further rows. WinUI has no wrapping
        panel in a Style (flex-wrap is an error), so this is one row
      -->
      <StackPanel class="links">
        {#each view.links as link (link.id)}
          <HyperlinkButton class="chip" onclick={() => window.open(link.uri)}>
            {link.title}
          </HyperlinkButton>
        {/each}
      </StackPanel>

      {#if view.isExtensionNeeded}
        <ExtensionPanel />
      {/if}

      {#if view.isKeyPromptShown}
        <KeyPanel />
      {/if}
    </StackPanel>
  </border>
{/if}

<style>
  .card {
    margin-bottom: 8px;
    padding: 12px;
    border-color: rgb(255 255 255 / 0.2);
    border-width: 1px;
    border-radius: 16px;
    background-color: rgb(27 27 31 / 0.9);
    -winui-elevation: 16px;
  }

  .card-content {
    gap: 8px;
  }

  .links {
    display: flex;
    flex-direction: row;
    gap: 6px;
  }

  .chip {
    padding: 2px 10px;
    border-radius: 12px;
    background-color: rgb(255 255 255 / 0.13);
  }
</style>
