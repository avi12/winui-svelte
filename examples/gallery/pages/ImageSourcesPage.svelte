<script lang="ts">
  import PageFrame from "#examples/gallery/PageFrame.svelte";
  import { keyControl } from "#examples/harness/smoke.ts";
  import { sineWav } from "#examples/media-elements/samples.ts";
  import {
    Button,
    Image,
    ImageIcon,
    StackPanel,
    TextBlock
  } from "winui-svelte/components";
  import { createMediaPlayer, mediaSourceOfBytes, svgImageSourceOf } from "winui-svelte/media";

  const RASTER_SIZE = 64;
  const TONE_MILLISECONDS = 1000;
  const GLYPH = "<svg xmlns=\"http://www.w3.org/2000/svg\" width=\"24\" height=\"24\"><path d=\"M12 2 L22 22 L2 22 Z\" fill=\"#000\"/></svg>";
  const glyph = svgImageSourceOf({
    source: GLYPH,
    rasterizePixelWidth: RASTER_SIZE,
    rasterizePixelHeight: RASTER_SIZE
  });
  const DATA_URI = `data:image/svg+xml;utf8,${encodeURIComponent(GLYPH)}`;
  const audio = createMediaPlayer({ volume: 0.2 });

  async function play() {
    audio.player.source = await mediaSourceOfBytes({
      bytes: sineWav(TONE_MILLISECONDS),
      contentType: "audio/wav"
    });
    audio.player.play();
  }

  $effect(() => () => audio.dispose());
</script>

<PageFrame
  caption="An Image takes an SvgImageSource (here made from markup and from a data URI); an ImageIcon colours it by Foreground when it is monochrome; a MediaPlayer plays audio with no window."
  title="Image sources and audio"
>
  <StackPanel {@attach keyControl("image-sources")}>
    <Image class="image-icon" source={glyph} />
    <Image class="image-icon" source={svgImageSourceOf({ source: DATA_URI })} />
    <ImageIcon source={glyph} />
    <Button onclick={play}>Play a tone</Button>
    <TextBlock>Position {audio.state.position} of {audio.state.naturalDuration} ms</TextBlock>
  </StackPanel>
</PageFrame>

<style>
  .image-icon {
    width: 32px;
    height: 32px;
  }
</style>
