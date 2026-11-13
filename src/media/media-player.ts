import { observePlayback } from "./playback-state.svelte.ts";
import { streamOf } from "#src/components/byte-stream.js";
import { mediaPlaybackSourceOf } from "#src/components/convert.js";
import type { MediaPlaybackSourceInput } from "#src/components/convert.js";
import { call, read } from "#src/renderer/host/reflect.js";
import { flush } from "#src/scheduling.js";
import { startTimer } from "#src/window/timers.js";
import type { MediaPlayerElement } from "#winui/microsoft/ui/xaml/controls/MediaPlayerElement";
import { MediaSource } from "#winui/windows/media/core/MediaSource";
import { IMediaPlaybackSource } from "#winui/windows/media/playback/IMediaPlaybackSource";
import { MediaPlayer } from "#winui/windows/media/playback/MediaPlayer";

// The class wrapper keeps its native value here; the interface is cast from that.
const POLL_MILLISECONDS = 100;
const NATIVE_OBJECT = "_obj";

const PLAYER_EVENTS = [
  "onBufferingEnded",
  "onBufferingStarted",
  "onCurrentStateChanged",
  "onIsMutedChanged",
  "onMediaEnded",
  "onMediaFailed",
  "onMediaOpened",
  "onMediaPlayerRateChanged",
  "onPlaybackMediaMarkerReached",
  "onSeekCompleted",
  "onSourceChanged",
  "onVolumeChanged"
] as const;

type PlayerEvent = typeof PLAYER_EVENTS[number];

// Each option `onX` names the MediaPlayer event `onX`, with its handler type.
type PlayerHandlers = {
  [Name in PlayerEvent]?: Parameters<MediaPlayer[Name]>[0];
};

/** What `createMediaPlayer` sets on the `MediaPlayer`, by WinUI's names, and the events it listens to. */
export interface MediaPlayerOptions extends PlayerHandlers {
  /** A URI (`https://`, `ms-appx://`, a file path) or any `IMediaPlaybackSource`. */
  source?: MediaPlaybackSourceInput;

  /** Whether the media plays as soon as it has opened. */
  autoPlay?: boolean;
  isLoopingEnabled?: boolean;
  isMuted?: boolean;

  /** From 0 to 1. */
  volume?: number;
  playbackRate?: number;
}

// The options that are not an event or the source, set on the player as they are.
const PLAIN_KEYS = ["autoPlay", "isLoopingEnabled", "isMuted", "volume", "playbackRate"] as const;

/**
 * A `Windows.Media.Playback.MediaPlayer` with no window: the way to play audio
 * from Svelte. The player is WinUI's own, so every member it has
 * (`play()`, `pause()`, `playbackSession`, `source`) is there; `state` holds
 * its position, duration and state as runes, read again every 100 ms.
 * MediaPlayer raises its events on a thread of its own, and the bindings do
 * not deliver an event raised there: the handlers in `options` run only
 * where WinUI raises on the UI thread, so rely on `state` and not on them.
 * Call it on the UI thread, and `dispose` when the player is no longer wanted.
 * Show it in a MediaPlayerElement with `attachTo(element)`, not with the
 * element's own `setMediaPlayer`: `dispose` then lets the element go first. A
 * closed player still held by an element in a window makes WinUI abort
 * `Window.Close` (E_ABORT), which ends the host when a hot update re-creates
 * the window.
 */
export function createMediaPlayer(options: MediaPlayerOptions = {}) {
  const player = new MediaPlayer();
  const { source, ...rest } = options;
  for (const key of PLAIN_KEYS) {
    const value = rest[key];
    const isGiven = value !== undefined;
    if (isGiven) {
      Object.assign(player, { [key]: value });
    }
  }

  const unsubscriptions: (() => void)[] = [];
  const { state, stop } = observePlayback({
    player,
    poll: refresh => startTimer({
      milliseconds: POLL_MILLISECONDS,
      onTick() {
        refresh();
        flush();
      }
    })
  });
  unsubscriptions.push(stop);
  unsubscriptions.push(
    ...subscribeAll({
      player,
      handlers: rest
    })
  );

  const hasSource = source !== undefined;
  if (hasSource) {
    player.source = mediaPlaybackSourceOf(source);
  }

  const elements = new Set<MediaPlayerElement>();
  return {
    player,
    state,
    /** Shows the player in `element`, until `dispose`. */
    attachTo(element: MediaPlayerElement) {
      element.setMediaPlayer(player);
      elements.add(element);
    },
    dispose() {
      for (const unsubscribe of unsubscriptions) {
        unsubscribe();
      }

      for (const element of elements) {
        call(element, "setMediaPlayer", null);
      }

      elements.clear();
      player.close();
    }
  };
}

function subscribeAll({ player, handlers }: {
  player: MediaPlayer;
  handlers: PlayerHandlers;
}) {
  const subscriptions: (() => void)[] = [];
  for (const name of PLAYER_EVENTS) {
    const handler = handlers[name];
    const unsubscribe = handler === undefined ? undefined : call(player, name, handler);
    const isSubscribed = typeof unsubscribe === "function";
    if (isSubscribed) {
      subscriptions.push(() => unsubscribe());
    }
  }

  return subscriptions;
}

/**
 * A media source over the bytes of an audio or video file, for a player's
 * `source`. `contentType` is the file's media type, such as `audio/wav`.
 */
export async function mediaSourceOfBytes({ bytes, contentType }: {
  bytes: Uint8Array;
  contentType: string;
}) {
  const stream = await streamOf(bytes);
  const source = MediaSource.createFromStream(stream, contentType);
  return IMediaPlaybackSource.from(read(source, NATIVE_OBJECT));
}
