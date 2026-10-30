import type { MediaPlaybackState } from "#winui/windows/media/playback/MediaPlaybackState";

// A MediaPlayer's state as runes, read from WinUI's own names: the player's
// Volume and IsMuted, and its PlaybackSession's PlaybackState, Position,
// NaturalDuration, BufferingProgress and CanSeek. Read-only to the app.

const TICKS_PER_MILLISECOND = 10_000n;
const NOTHING_PLAYING: MediaPlaybackState = 0;
const PAUSED: MediaPlaybackState = 4;

type Subscribe = (callback: () => void) => () => void;

/** The part of a `MediaPlayer` the state reads; a real `MediaPlayer` is one. */
export interface ObservedPlayer {
  readonly volume: number;
  readonly isMuted: boolean;
  onVolumeChanged: Subscribe;
  onIsMutedChanged: Subscribe;
  readonly playbackSession: {
    readonly playbackState: MediaPlaybackState;
    readonly position: { readonly duration: bigint };
    readonly naturalDuration: { readonly duration: bigint };
    readonly bufferingProgress: number;
    readonly canSeek: boolean;
    onPlaybackStateChanged: Subscribe;
    onPositionChanged: Subscribe;
    onNaturalDurationChanged: Subscribe;
    onBufferingProgressChanged: Subscribe;
  };
}

function milliseconds(span: { readonly duration: bigint }) {
  return Number(span.duration / TICKS_PER_MILLISECOND);
}

/**
 * What a player is doing now. Each field is reactive and follows the event
 * WinUI raises for it.
 */
export class PlaybackState {
  /** `PlaybackSession.PlaybackState`: None, Opening, Buffering, Playing or Paused. */
  playbackState = $state.raw(NOTHING_PLAYING);

  /** `PlaybackSession.Position`, in milliseconds. */
  position = $state.raw(0);

  /** `PlaybackSession.NaturalDuration`, in milliseconds; 0 until the media opens. */
  naturalDuration = $state.raw(0);

  /** `PlaybackSession.BufferingProgress`, from 0 to 1. */
  bufferingProgress = $state.raw(0);

  /** `PlaybackSession.CanSeek`. */
  canSeek = $state.raw(false);

  /** `MediaPlayer.Volume`, from 0 to 1. */
  volume = $state.raw(1);

  /** `MediaPlayer.IsMuted`. */
  isMuted = $state.raw(false);

  /** Whether the media played to its end: paused with the position at the natural duration. */
  get isEnded() {
    const isKnown = this.naturalDuration > 0;
    return isKnown && this.position >= this.naturalDuration && this.playbackState === PAUSED;
  }
}

/**
 * Fills a {@link PlaybackState} from a player now, and again each time the
 * player says a value changed, and on each tick of `poll`. The polling is
 * there because the bindings drop an event WinUI raises on a thread of its own
 * (MediaPlayer raises all of its events there): a poll on the UI thread is
 * what keeps the state true.
 *
 * @returns The state, and `stop`, which unsubscribes and stops the poll.
 */
export function observePlayback({ player, poll }: {
  player: ObservedPlayer;
  poll?: (refresh: () => void) => () => void;
}) {
  const state = new PlaybackState();
  const { playbackSession: session } = player;
  function read() {
    state.playbackState = session.playbackState;
    state.position = milliseconds(session.position);
    state.naturalDuration = milliseconds(session.naturalDuration);
    state.bufferingProgress = session.bufferingProgress;
    state.canSeek = session.canSeek;
    state.volume = player.volume;
    state.isMuted = player.isMuted;
  }

  read();
  const subscriptions = [
    session.onPlaybackStateChanged(read),
    session.onPositionChanged(read),
    session.onNaturalDurationChanged(read),
    session.onBufferingProgressChanged(read),
    player.onVolumeChanged(read),
    player.onIsMutedChanged(read),
    ...poll ? [poll(read)] : []
  ];
  return {
    state,
    stop() {
      for (const unsubscribe of subscriptions) {
        unsubscribe();
      }
    }
  };
}
