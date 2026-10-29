<script lang="ts">
  import PageFrame from "#examples/gallery/PageFrame.svelte";
  import { keyControl } from "#examples/harness/smoke.ts";
  import type { UIElement } from "#winui/microsoft/ui/xaml/UIElement";
  import { elementRef } from "winui-svelte";
  import {
    Button,
    Image,
    MediaPlayerElement,
    StackPanel,
    TextBlock
  } from "winui-svelte/components";
  import { connectElement, startConnected } from "winui-svelte/connected-animation";

  const IMAGE_SIZE = 96;
  const HERO_SIZE = 192;
  const BADGE = new TextEncoder().encode(
    `<svg xmlns="http://www.w3.org/2000/svg" width="96" height="96">
      <rect width="96" height="96" rx="16" fill="#00e5ff"/>
      <circle cx="48" cy="48" r="24" fill="#06182b"/>
    </svg>`
  );
  const CONNECTED_KEY = "badge";

  const thumbnail = elementRef<UIElement>();
  const hero = elementRef<UIElement>();
  let isDetail = $state(false);
  let outcome = $state("not played yet");

  function showDetail() {
    const element = thumbnail.current;
    if (element !== undefined) {
      connectElement({
        key: CONNECTED_KEY,
        element
      });
    }

    isDetail = true;
  }

  $effect(() => {
    const element = hero.current;
    if (element !== undefined) {
      outcome = startConnected({
        key: CONNECTED_KEY,
        element
      }) ? "played from the thumbnail" : "nothing was prepared";
    }
  });
</script>

<PageFrame
  caption="An image takes the bytes of a file. A connected animation carries one element into the next view; the media player takes a URI."
  title="Media"
>
  <StackPanel class="media-block">
    {#if isDetail}
      <Image {@attach hero.attach} height={HERO_SIZE} source={BADGE} width={HERO_SIZE} />
      <Button onClick={() => (isDetail = false)}>Back</Button>
    {:else}
      <Image {@attach thumbnail.attach} {@attach keyControl("media")} height={IMAGE_SIZE} source={BADGE} width={IMAGE_SIZE} />
      <Button onClick={showDetail}>Open it large</Button>
    {/if}
    <TextBlock text="Connected animation: {outcome}" />
    <MediaPlayerElement areTransportControlsEnabled height={160} />
  </StackPanel>
</PageFrame>

<style>
  :global(.media-block) {
    gap: 8px;
  }
</style>
