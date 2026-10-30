// The opt-in media part of the package: `winui-svelte/media`. Image sources
// WinUI cannot make from a bare prop, and a MediaPlayer with no window for
// audio. The `Image`, `ImageBrush`, `ImageIcon` and `MediaPlayerElement`
// components themselves come from `winui-svelte/components`.

export type { DataUriContent } from "./data-uri.ts";
export { decodeDataUri, isDataUri } from "./data-uri.ts";
export type { BitmapImageOptions, ImageInput, SvgImageSourceOptions } from "./images.ts";
export { bitmapImageOf, svgImageSourceOf } from "./images.ts";
export type { MediaPlayerOptions } from "./media-player.ts";
export { createMediaPlayer, mediaSourceOfBytes } from "./media-player.ts";
export type { ObservedPlayer } from "./playback-state.svelte.ts";
export { observePlayback, PlaybackState } from "./playback-state.svelte.ts";
