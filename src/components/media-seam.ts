import type { ImageSource } from "./generated/bindings.ts";
import type { IMediaPlaybackSource } from "#winui/windows/media/playback/IMediaPlaybackSource";

// How a prop given image bytes or a media URI gets the WinUI object. Making
// it takes the streams, DataWriter and MediaSource, which a bundle of one
// Button need not carry: the converters reach them through this seam, and
// `installMedia()` (media.ts) connects it.

/** Image bytes, and whether they are SVG text. */
export interface ImageBytes {
  bytes: Uint8Array;
  isSvg: boolean;
}

/** What the components need of WinUI to take image bytes and a media URI. */
export interface MediaSeam {
  /** An image that fills itself from the bytes once they are written to a stream. */
  imageOfBytes(options: ImageBytes): ImageSource;
  playbackSourceOf(uri: string): IMediaPlaybackSource;
}

let installed: MediaSeam | null = null;

/**
 * Connects the components to WinUI's streams and media sources: `runWindow`
 * does it, a host of one's own calls `installMedia()`.
 */
export function installMediaSeam(seam: MediaSeam) {
  installed = seam;
}

/**
 * The seam a prop given image bytes or a media URI goes through.
 *
 * @throws {Error} When no application has installed it.
 */
export function mediaSeam() {
  const seam = installed;
  const isInstalled = seam !== null;
  if (!isInstalled) {
    throw new Error("Image bytes and media URIs need runWindow or installMedia()");
  }

  return seam;
}
