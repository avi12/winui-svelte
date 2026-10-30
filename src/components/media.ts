import { streamOf } from "./byte-stream.ts";
import { BitmapImage, SvgImageSource, Uri } from "./generated/bindings.ts";
import { installMediaSeam } from "./media-seam.ts";
import { read } from "#src/renderer/host/reflect.js";
import { MediaSource } from "#winui/windows/media/core/MediaSource";
import { IMediaPlaybackSource } from "#winui/windows/media/playback/IMediaPlaybackSource";

// The class wrapper keeps its native value here; the interface is cast from that.
const NATIVE_OBJECT = "_obj";

// The image is handed on at once and fills itself when the stream is ready; a
// bad image reaches the app as the image's own ImageFailed event.
/**
 * Decodes image bytes into an image source; the bytes are the source's own
 * once this settles.
 */
export async function fillImage({ bytes, image }: {
  bytes: Uint8Array;
  image: BitmapImage | SvgImageSource;
}) {
  const stream = await streamOf(bytes);
  await image.setSourceAsync(stream);
}

/**
 * Lets a prop be given image bytes (`source` of an Image, `imageSource` of a
 * brush) or a media URI (`source` of a MediaPlayerElement). `runWindow` calls
 * it when the application starts; call it yourself when the app starts WinUI
 * another way.
 */
export function installMedia() {
  installMediaSeam({
    imageOfBytes({ bytes, isSvg }) {
      const image = isSvg ? new SvgImageSource() : new BitmapImage();
      fillImage({
        bytes,
        image
      }).catch(() => undefined);
      return image;
    },
    playbackSourceOf(uri) {
      return IMediaPlaybackSource.from(read(MediaSource.createFromUri(new Uri(uri)), NATIVE_OBJECT));
    }
  });
}
