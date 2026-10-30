<script lang="ts">
  import PageFrame from "#examples/gallery/PageFrame.svelte";
  import { keyControl } from "#examples/harness/smoke.ts";
  import { sineWav } from "#examples/media/samples.ts";
  import {
    Button,
    Image,
    ImageIcon,
    StackPanel,
    TextBlock
  } from "winui-svelte/components";
  import { createMediaPlayer, mediaSourceOfBytes, svgImageSourceOf } from "winui-svelte/media";

  const ICON_SIZE = 32;
  const TONE_MILLISECONDS = 1000;
  const GLYPH = "<svg xmlns=\"http://www.w3.org/2000/svg\" width=\"24\" height=\"24\"><path d=\"M12 2 L22 22 L2 22 Z\" fill=\"#000\"/></svg>";
  const glyph = svgImageSourceOf({
    source: GLYPH,
    rasterizePixelWidth: ICON_SIZE * 2,
    rasterizePixelHeight: ICON_SIZE * 2
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
    <Image height={ICON_SIZE} source={glyph} width={ICON_SIZE} />
    <Image height={ICON_SIZE} source={svgImageSourceOf({ source: DATA_URI })} width={ICON_SIZE} />
    <ImageIcon foreground="#00e5ff" showAsMonochrome source={glyph} />
    <Button onClick={play}>Play a tone</Button>
    <TextBlock text="Position {audio.state.position} of {audio.state.naturalDuration} ms" />
  </StackPanel>
</PageFrame>
