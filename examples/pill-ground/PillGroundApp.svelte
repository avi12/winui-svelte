<script lang="ts">
  import CaptionCard from "./CaptionCard.svelte";
  import Glow from "./Glow.svelte";
  import Pill from "./Pill.svelte";
  import { view } from "./view.svelte.ts";
  import { elementSize } from "winui-svelte";
  import { StackPanel, Window } from "winui-svelte/components";
  import { exitApplication } from "winui-svelte/window";

  const PILL_WIDTH = 504;
  const MIN_HEIGHT = 48;

  const content = elementSize();

  // The window is as tall as its content. GAP: a new height resizes from the
  // top-left corner, so the bottom-right corner does not stay pinned while
  // the card grows upward; the host must move the window by the difference
  // (`bind:handle`, handle.appWindow.move) or place it again
  const size = $derived({
    height: Math.max(MIN_HEIGHT, content.desiredHeight)
  });
</script>

<!--
  GAP: no per-pixel transparent window (API.md, Window), so the gaps between
  the card and the pill, and the halo, show the window's solid color
  `isActivatable` follows the host: false until the user selects text or the
  key prompt opens (setFocusable), a prop that changes at run time
-->
<Window
  dragRegions={[{
    x: 0,
    y: Math.max(0, size.height - MIN_HEIGHT),
    width: PILL_WIDTH,
    height: MIN_HEIGHT
  }]}
  height={size.height}
  isActivatable={view.isFocusable}
  isAlwaysOnTop
  isBorderless
  isHidden={!view.isShown}
  isToolWindow
  onclosed={exitApplication}
  title="Gemini Live"
  width={PILL_WIDTH}
>
  <StackPanel {@attach content.attach}>
    <CaptionCard />
    <Pill />
    <Glow />
  </StackPanel>
</Window>
