import type { ObservedPlayer } from "./playback-state.svelte.ts";
import "#src/state/test-support/svelte-runes.js";
import type { MediaPlaybackState } from "#winui/windows/media/playback/MediaPlaybackState";
import assert from "node:assert/strict";
import { test } from "node:test";

const { observePlayback } = await import("./playback-state.svelte.ts");
const { track } = await import("#src/state/test-support/track.svelte.js");

const PLAYING: MediaPlaybackState = 3;
const PAUSED: MediaPlaybackState = 4;
const TICKS_PER_SECOND = 10_000_000n;

type Listener = () => void;

function makeSession(owner: FakePlayer) {
  return {
    get playbackState() {
      return owner.playbackState;
    },
    get position() {
      return { duration: owner.position };
    },
    get naturalDuration() {
      return { duration: owner.naturalDuration };
    },
    get bufferingProgress() {
      if (owner.isBufferingUnavailable) {
        throw new Error("0x80004002: No such interface supported");
      }

      return owner.bufferingProgress;
    },
    canSeek: true,
    onPlaybackStateChanged: (callback: Listener) => owner.listen({
      name: "state",
      callback
    }),
    onPositionChanged: (callback: Listener) => owner.listen({
      name: "position",
      callback
    }),
    onNaturalDurationChanged: (callback: Listener) => owner.listen({
      name: "duration",
      callback
    }),
    onBufferingProgressChanged: (callback: Listener) => owner.listen({
      name: "buffering",
      callback
    })
  };
}

// A player that records who listens, and raises an event on demand.
class FakePlayer implements ObservedPlayer {
  volume = 1;
  isMuted = false;
  position = 0n;
  bufferingProgress = 0;
  isBufferingUnavailable = false;
  naturalDuration = 0n;
  playbackState: MediaPlaybackState = 0;
  readonly listeners = new Map<string, Set<Listener>>();
  readonly playbackSession = makeSession(this);

  onVolumeChanged(callback: Listener) {
    return this.listen({
      name: "volume",
      callback
    });
  }

  onIsMutedChanged(callback: Listener) {
    return this.listen({
      name: "muted",
      callback
    });
  }

  listen({ name, callback }: {
    name: string;
    callback: Listener;
  }) {
    const set = this.listeners.get(name) ?? new Set<Listener>();
    set.add(callback);
    this.listeners.set(name, set);
    return () => set.delete(callback);
  }

  raise(name: string) {
    for (const callback of this.listeners.get(name) ?? []) {
      callback();
    }
  }
}

test("the state reads the player now, and follows its events", () => {
  const fake = new FakePlayer();
  const { state, stop } = observePlayback({ player: fake });
  const seen = track(() => `${state.playbackState}@${state.position}/${state.naturalDuration}`);
  assert.equal(seen.values.at(-1), "0@0/0");

  fake.naturalDuration = 3n * TICKS_PER_SECOND;
  fake.raise("duration");
  fake.playbackState = PLAYING;
  fake.raise("state");
  fake.position = TICKS_PER_SECOND / 2n;
  fake.raise("position");
  assert.equal(state.position, 500);
  assert.equal(state.naturalDuration, 3000);
  assert.equal(state.playbackState, PLAYING);
  seen.stop();
  stop();
});

test("stop unsubscribes every event", () => {
  const player = new FakePlayer();
  const { stop } = observePlayback({ player });
  assert.ok([...player.listeners.values()].every(set => set.size === 1));
  stop();
  assert.ok([...player.listeners.values()].every(set => set.size === 0));
});

test("volume and mute follow their own events", () => {
  const player = new FakePlayer();
  const { state, stop } = observePlayback({ player });
  player.volume = 0.25;
  player.raise("volume");
  player.isMuted = true;
  player.raise("muted");
  assert.equal(state.volume, 0.25);
  assert.equal(state.isMuted, true);
  stop();
});

test("a poll refreshes the state without an event, and stops with the state", () => {
  const player = new FakePlayer();
  function idle() {}
  let tick = idle;
  let isPolling = false;
  const { state, stop } = observePlayback({
    player,
    poll(refresh) {
      tick = refresh;
      isPolling = true;
      return () => {
        isPolling = false;
      };
    }
  });
  player.naturalDuration = TICKS_PER_SECOND;
  player.position = TICKS_PER_SECOND;
  player.playbackState = PAUSED;
  assert.equal(state.isEnded, false, "nothing was raised, so nothing is known yet");
  tick();
  assert.equal(state.isEnded, true, "paused at the end of a known duration");
  stop();
  assert.equal(isPolling, false);
});

test("a read of the buffering progress that fails keeps the last value and the others still update", () => {
  const player = new FakePlayer();
  player.bufferingProgress = 0.5;
  const { state, stop } = observePlayback({ player });
  assert.equal(state.bufferingProgress, 0.5);
  player.isBufferingUnavailable = true;
  player.playbackState = PAUSED;
  player.raise("state");
  assert.equal(state.bufferingProgress, 0.5);
  assert.equal(state.playbackState, PAUSED);
  stop();
});
