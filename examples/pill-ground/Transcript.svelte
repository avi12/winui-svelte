<script lang="ts">
  import { send, view } from "./view.svelte.ts";
  import { fade } from "svelte/transition";
  import {
    Bold,
    Run,
    ScrollViewer,
    StackPanel,
    TextBlock
  } from "winui-svelte/components";

  const LINE_FADE_MILLISECONDS = 150;

  function speaker(isUser: boolean) {
    if (isUser) {
      return "You: ";
    }

    return "Gemini: ";
  }
</script>

<!--
  A hidden scroll bar that still scrolls: verticalScrollBarVisibility
  "Hidden" (WinUI's ScrollBarVisibility.Hidden: no bar, scrolling stays
  on). The CSS `overflow: hidden` on a scroll-viewer is NOT this: it
  maps to Disabled, which switches scrolling off
-->
<ScrollViewer class="transcript" horizontalScrollBarVisibility="Disabled" verticalScrollBarVisibility="Hidden">
  <StackPanel class="lines">
    {#each view.lines as line (line.id)}
      <border in:fade={{ duration: LINE_FADE_MILLISECONDS }}>
        <!--
          Selectable and copyable: isTextSelectionEnabled. A selection
          is the cue to make the window focusable (setFocusable)
        -->
        <TextBlock
          isTextSelectionEnabled
          onselectionchanged={() => send({
            kind: "setFocusable",
            isFocusable: true
          })}
          textWrapping="Wrap"
        >
          {#if line.isNote}
            <Run>{line.text}</Run>
          {:else}
            <Bold>{speaker(line.isUser)}</Bold><Run>{line.text}</Run>
          {/if}
        </TextBlock>
      </border>
    {/each}
  </StackPanel>
</ScrollViewer>

<style>
  .transcript {
    max-height: 200px;
  }

  .lines {
    gap: 4px;
  }
</style>
