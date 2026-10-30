<script lang="ts">
  import { sineWav, twoColorPng, twoColorSvg } from "./samples.ts";
  import type { ExampleCommand, ExampleHost } from "#examples/harness/contract.ts";
  import { projectAs } from "#src/winui.js";
  import type { Image as ImageControl } from "#winui/microsoft/ui/xaml/controls/Image";
  import { BitmapImage as BitmapImageSource } from "#winui/microsoft/ui/xaml/media/imaging/BitmapImage";
  import { RenderTargetBitmap } from "#winui/microsoft/ui/xaml/media/imaging/RenderTargetBitmap";
  import { writeFileSync } from "node:fs";
  import { tmpdir } from "node:os";
  import path from "node:path";
  import { SvelteMap, SvelteSet } from "svelte/reactivity";
  import { control, flush } from "winui-svelte";
  import { BitmapImage, Image, StackPanel, Window } from "winui-svelte/components";
  import { bitmapImageOf, createMediaPlayer, mediaSourceOfBytes, svgImageSourceOf } from "winui-svelte/media";
  import { exitApplication } from "winui-svelte/window";
  import { z } from "zod";

  const WINDOW_HEIGHT = 420;
  const WINDOW_WIDTH = 360;
  const IMAGE_SIZE = 16;
  const PIXEL_BYTES = 4;
  const TONE_MILLISECONDS = 400;
  const BAD_BYTE_COUNT = 3;
  const BAD_BYTES = new Uint8Array(BAD_BYTE_COUNT);
  const QUARTERS = 4;
  const LEFT_QUARTER = 1 / QUARTERS;
  const RIGHT_QUARTER = 1 - LEFT_QUARTER;
  const RED = {
    r: 255,
    g: 0,
    b: 0,
    a: 255
  };
  const BLUE = {
    r: 0,
    g: 0,
    b: 255,
    a: 255
  };

  interface Props {
    // The harness's, handed over once: it never changes.
    host: ExampleHost;
  }

  const { host }: Props = $props();
  const png = twoColorPng({
    width: 4,
    height: 4,
    left: RED,
    right: BLUE
  });
  const PNG_PATH = path.join(tmpdir(), `winui-svelte-media-${process.pid}.png`);
  writeFileSync(PNG_PATH, png);
  const failures = new SvelteMap<string, string>();
  const fromBytes = bitmapImageOf({ source: png });
  const fromDataUri = bitmapImageOf({ source: `data:image/png;base64,${Buffer.from(png).toString("base64")}` });
  const broken = bitmapImageOf({
    source: BAD_BYTES,
    onFailed: error => failures.set("broken", String(error))
  });
  const svg = svgImageSourceOf({
    source: twoColorSvg({
      size: IMAGE_SIZE,
      left: "#00ff00",
      right: "#ffff00"
    }),
    rasterizePixelWidth: IMAGE_SIZE * 2,
    rasterizePixelHeight: IMAGE_SIZE * 2
  });
  const natives = new SvelteMap<string, ImageControl>();
  const opened = new SvelteSet<string>();
  let player: ReturnType<typeof createMediaPlayer> | undefined;

  function track(name: string) {
    return control<ImageControl>(native => {
      natives.set(name, native);
    });
  }

  const failureSchema = z.tuple([z.unknown(), z.object({ errorMessage: z.string() })]);

  function failureMessage(args: unknown[]) {
    const parsed = failureSchema.safeParse(args);
    return parsed.success ? parsed.data[1].errorMessage : "unknown";
  }

  function imageEvents(name: string) {
    return {
      onimageopened: () => opened.add(name),
      onimagefailed: (...args: unknown[]) => failures.set(name, failureMessage(args))
    };
  }

  // The colors a rendered Image shows a quarter and three quarters across.
  async function colorsOf(name: string) {
    const native = natives.get(name);
    if (!native) {
      return null;
    }

    const bitmap = new RenderTargetBitmap();
    await bitmap.renderAsync(native);
    const bytes = (await bitmap.getPixelsAsync()).toBuffer();
    const { pixelWidth, pixelHeight } = bitmap;
    function pixelAt(fraction: number) {
      const start = (Math.floor(pixelHeight / 2) * pixelWidth + Math.floor(pixelWidth * fraction)) * PIXEL_BYTES;
      const [blue = 0, green = 0, red = 0, alpha = 0] = bytes.subarray(start, start + PIXEL_BYTES);
      return [red, green, blue, alpha];
    }

    return {
      width: pixelWidth,
      left: pixelAt(LEFT_QUARTER),
      right: pixelAt(RIGHT_QUARTER)
    };
  }

  async function reportImages() {
    flush();
    host.report({
      kind: "images",
      opened: [...opened].sort(),
      failures: Object.fromEntries(failures),
      pngWidth: projectAs(fromBytes, BitmapImageSource).pixelWidth,
      pngHeight: projectAs(fromBytes, BitmapImageSource).pixelHeight,
      dataUriWidth: projectAs(fromDataUri, BitmapImageSource).pixelWidth,
      bytes: await colorsOf("bytes"),
      svg: await colorsOf("svg"),
      file: await colorsOf("file")
    });
  }

  async function playTone() {
    player?.dispose();
    player = createMediaPlayer({ volume: 0 });
    player.player.source = await mediaSourceOfBytes({
      bytes: sineWav(TONE_MILLISECONDS),
      contentType: "audio/wav"
    });
    player.player.play();
  }

  function reportAudio() {
    host.report({
      kind: "audio",
      playbackState: player?.state.playbackState ?? null,
      position: player?.state.position ?? null,
      naturalDuration: player?.state.naturalDuration ?? null,
      isEnded: player?.state.isEnded ?? false
    });
  }

  function reportError(error: unknown) {
    host.report({
      kind: "error",
      message: String(error)
    });
  }

  const commands = new Map<string, (command: ExampleCommand) => void>([
    ["images", () => reportImages().catch(reportError)],
    ["play", () => playTone().then(reportAudio).catch(reportError)],
    ["audio", reportAudio],
    ["close", () => exitApplication()]
  ]);
  // svelte-ignore state_referenced_locally
  host.onCommand(command => commands.get(String(command["cmd"]))?.(command));
</script>

<Window
  height={WINDOW_HEIGHT}
  onclosed={exitApplication}
  title="Media example"
  width={WINDOW_WIDTH}
>
  <StackPanel>
    <Image style:width="{IMAGE_SIZE}px" style:height="{IMAGE_SIZE}px" {@attach track("bytes")} source={fromBytes} {...imageEvents("bytes")} />
    <Image style:width="{IMAGE_SIZE}px" style:height="{IMAGE_SIZE}px" {@attach track("dataUri")} source={fromDataUri} {...imageEvents("dataUri")} />
    <Image style:width="{IMAGE_SIZE}px" style:height="{IMAGE_SIZE}px" {@attach track("svg")} source={svg} {...imageEvents("svg")} />
    <Image style:width="{IMAGE_SIZE}px" style:height="{IMAGE_SIZE}px" {@attach track("broken")} source={broken} {...imageEvents("broken")} />
    <Image style:width="{IMAGE_SIZE}px" style:height="{IMAGE_SIZE}px" {@attach track("file")} {...imageEvents("file")}>
      {#snippet source()}
        <BitmapImage decodePixelWidth={IMAGE_SIZE} uriSource={PNG_PATH} />
      {/snippet}
    </Image>
  </StackPanel>
</Window>
