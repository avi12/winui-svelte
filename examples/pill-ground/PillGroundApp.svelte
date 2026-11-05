<script lang="ts">
  import CaptionCard from "./CaptionCard.svelte";
  import Glow from "./Glow.svelte";
  import { commandsOf } from "./pill-commands.ts";
  import { PillSize } from "./pill-view.ts";
  import Pill from "./Pill.svelte";
  import { view } from "./view.svelte.ts";
  import type { ExampleHost } from "#examples/harness/contract.ts";
  import { elementSize } from "winui-svelte";
  import { StackPanel, Window } from "winui-svelte/components";
  import type { WindowHandle } from "winui-svelte/components";
  import { Backdrop, exitApplication, WindowAnchor } from "winui-svelte/window";

  const PILL_WIDTH = 504;
  const DOCK_INSET = 6;

  const { host }: { host: ExampleHost } = $props();

  // `--backdrop mica` gives the window a material instead (an inactive window
  // shows the theme's solid color for it), which a test compares the
  // transparent window with
  const BACKDROP = Object.values(Backdrop).find(kind => kind === host.options["backdrop"]) ?? Backdrop.transparent;

  const content = elementSize();
  let handle: WindowHandle | undefined = $state();

  // The window docks once, when it exists: after that its bottom-right corner
  // stays where it is while the card grows upward (sizeToContent, anchor)
  $effect(() => {
    handle?.dock({
      anchor: WindowAnchor.bottomRight,
      inset: DOCK_INSET
    });
  });

  // svelte-ignore state_referenced_locally
  host.onCommand(
    commandsOf({
      host,
      handle: () => handle,
      content
    })
  );
</script>

<!--
  One transparent, borderless tool window: the card, the pill and the glow are
  the only pixels it draws, and the desktop shows through the rest
  `isActivatable` follows the host: false until the user selects text or the
  key prompt opens (setFocusable), a prop that changes at run time
  `isResizable={false}` drops the 8 pixel resize frame that `isBorderless`
  leaves, which would shrink the content and paint a strip along the top
  The pill is the bottom of the content; the glow room under it is part of the
  content too, so the window is tall enough for the blur to bleed into
-->
<Window
  activate={false}
  anchor="bottomRight"
  backdrop={BACKDROP}
  dragRegions={[{
    x: 0,
    y: Math.max(0, content.desiredHeight - PillSize.height - PillSize.glowRoom),
    width: PILL_WIDTH,
    height: PillSize.height
  }]}
  isActivatable={view.isFocusable}
  isAlwaysOnTop
  isBorderless
  isHidden={!view.isShown}
  isResizable={false}
  isToolWindow
  onclosed={exitApplication}
  sizeToContent="height"
  title="Gemini Live"
  width={PILL_WIDTH}
  bind:handle
>
  <StackPanel {@attach content.attach}>
    <CaptionCard />
    <Glow>
      <Pill />
    </Glow>
  </StackPanel>
</Window>
