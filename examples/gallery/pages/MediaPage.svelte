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
    const isReady = element !== undefined;
    if (isReady) {
      connectElement({
        key: CONNECTED_KEY,
        element
      });
    }

    isDetail = true;
  }

  $effect(() => {
    const element = hero.current;
    const isReady = element !== undefined;
    if (isReady) {
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
      <Image class="media-hero" {@attach hero.attach} source={BADGE} />
      <Button onclick={() => (isDetail = false)}>Back</Button>
    {:else}
      <Image class="media-thumbnail" {@attach thumbnail.attach} {@attach keyControl("media")} source={BADGE} />
      <Button onclick={showDetail}>Open it large</Button>
    {/if}
    <TextBlock>Connected animation: {outcome}</TextBlock>
    <MediaPlayerElement class="media-player" areTransportControlsEnabled />
  </StackPanel>
</PageFrame>

<style>
  .media-block {
    gap: 8px;
  }

  .media-thumbnail {
    width: 96px;
    height: 96px;
  }

  .media-hero {
    width: 192px;
    height: 192px;
  }

  .media-player {
    height: 160px;
  }
</style>
