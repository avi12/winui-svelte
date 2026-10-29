import { BitmapImage, SvgImageSource, Uri } from "./generated/bindings.ts";
import { installMediaSeam } from "./media-seam.ts";
import { read } from "#src/renderer/host/reflect.js";
import { MediaSource } from "#winui/windows/media/core/MediaSource";
import { IMediaPlaybackSource } from "#winui/windows/media/playback/IMediaPlaybackSource";
import { DataWriter } from "#winui/windows/storage/streams/DataWriter";
import { InMemoryRandomAccessStream } from "#winui/windows/storage/streams/InMemoryRandomAccessStream";

const START = 0n;
// The class wrapper keeps its native value here; the interface is cast from that.
const NATIVE_OBJECT = "_obj";

async function streamOf(bytes: Uint8Array) {
  const stream = new InMemoryRandomAccessStream();
  const writer = new DataWriter(stream);
  writer.writeBytes(bytes);
  await writer.storeAsync();
  writer.detachStream();
  stream.seek(START);
  return stream;
}

// The image is handed on at once and fills itself when the stream is ready; a
// bad image reaches the app as the image's own ImageFailed event.
async function fillImage({ bytes, image }: {
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
