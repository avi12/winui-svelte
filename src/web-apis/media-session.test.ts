import assert from "node:assert/strict";
import { test } from "node:test";

// sessionOf() over a stand-in for the Windows media overlay:
// metadata, playback state, action handlers, position validation, the
// overlay's requests, and the WinUI extras. The real overlay is not touched.

const { installMediaSession, MediaMetadata, MediaSession } = await import("./media-session.ts");

type Backend = NonNullable<Parameters<typeof installMediaSession>[0]>["backend"];
type Snapshot = Parameters<NonNullable<Backend>["show"]>[0];
type Request = Parameters<Parameters<NonNullable<Backend>["onRequest"]>[0]>[0];

function fakeBackend() {
  const shown: Snapshot[] = [];
  const callbacks: ((request: Request) => void)[] = [];
  const state = { isClosed: false };
  const backend = {
    show(snapshot) {
      shown.push(snapshot);
    },
    onRequest(callback) {
      callbacks.push(callback);
      return () => undefined;
    },
    close() {
      state.isClosed = true;
    }
  } satisfies NonNullable<Backend>;
  return {
    backend,
    shown,
    state,
    raise(request: Request) {
      for (const callback of callbacks) {
        callback(request);
      }
    },
    last() {
      const snapshot = shown.at(-1);
      assert.ok(snapshot);
      return snapshot;
    }
  };
}

function sessionOf() {
  const session: unknown = navigator.mediaSession;
  assert.ok(session instanceof MediaSession);
  return session;
}

function withSession(run: (fake: ReturnType<typeof fakeBackend>) => void) {
  const fake = fakeBackend();
  const uninstall = installMediaSession({ backend: fake.backend });
  try {
    run(fake);
  } finally {
    uninstall();
  }
}

test("installing defines the globals and uninstalling takes them away", () => {
  const fake = fakeBackend();
  const uninstall = installMediaSession({ backend: fake.backend });
  sessionOf();
  assert.equal(globalThis.MediaMetadata, MediaMetadata);
  uninstall();
  assert.equal(navigator.mediaSession, undefined);
  assert.equal(fake.state.isClosed, true);
});

test("metadata reaches the overlay, also when it changes after being set", () => {
  withSession(fake => {
    const metadata = new MediaMetadata({
      title: "Song",
      artist: "Band",
      album: "Record",
      artwork: [{
        src: "cover.png",
        sizes: "96x96",
        type: "image/png"
      }]
    });
    sessionOf().metadata = metadata;
    assert.deepEqual(
      {
        title: fake.last().metadata?.title,
        album: fake.last().metadata?.album
      },
      {
        title: "Song",
        album: "Record"
      }
    );
    metadata.title = "Other";
    assert.equal(fake.last().metadata?.title, "Other");
    sessionOf().metadata = null;
    assert.equal(fake.last().metadata, null);
    metadata.title = "Detached";
    assert.equal(fake.last().metadata, null);
    assert.throws(() => {
      Object.assign(sessionOf(), {
        metadata: {
          title: "plain"
        }
      });
    }, TypeError);
  });
});

test("the playback state ignores a value that is not one", () => {
  withSession(fake => {
    assert.equal(sessionOf().playbackState, "none");
    sessionOf().playbackState = "playing";
    assert.equal(fake.last().playbackState, "playing");
    Object.assign(sessionOf(), { playbackState: "rewinding" });
    assert.equal(sessionOf().playbackState, "playing");
  });
});

test("an action handler enables its button and receives the overlay's press", () => {
  withSession(fake => {
    const received: string[] = [];
    sessionOf().setActionHandler("play", details => {
      received.push(details.action);
    });
    sessionOf().setActionHandler("seekto", details => {
      received.push(`seekto ${details.seekTime}`);
    });
    assert.deepEqual([...fake.last().actions].sort(), ["play", "seekto"]);
    fake.raise({
      kind: "action",
      details: {
        action: "play"
      }
    });
    fake.raise({
      kind: "action",
      details: {
        action: "pause"
      }
    });
    fake.raise({
      kind: "action",
      details: {
        action: "seekto",
        seekTime: 12.5
      }
    });
    assert.deepEqual(received, ["play", "seekto 12.5"]);
    sessionOf().setActionHandler("play", null);
    assert.deepEqual([...fake.last().actions], ["seekto"]);
  });
});

test("an unknown action throws, a standard one Windows lacks is accepted", () => {
  withSession(() => {
    assert.throws(() => {
      sessionOf().setActionHandler("dance", () => undefined);
    }, TypeError);
    sessionOf().setActionHandler("skipad", () => undefined);
  });
});

test("position state is validated as the spec says and can be cleared", () => {
  withSession(fake => {
    sessionOf().setPositionState({
      duration: 100,
      position: 40,
      playbackRate: 1.5
    });
    assert.deepEqual(fake.last().position, {
      duration: 100,
      position: 40,
      playbackRate: 1.5
    });
    for (const bad of [{ duration: -1 }, {
      duration: 10,
      position: 11
    }, {
      duration: 10,
      playbackRate: 0
    }, {
      duration: 10,
      position: -1
    }]) {
      assert.throws(() => {
        sessionOf().setPositionState(bad);
      }, TypeError);
    }

    sessionOf().setPositionState();
    assert.equal(fake.last().position, null);
  });
});

test("the WinUI extras: media type, album fields, shuffle and repeat requests", () => {
  withSession(fake => {
    sessionOf().metadata = new MediaMetadata({
      title: "Film",
      mediaType: "video",
      subtitle: "Part 2",
      genres: ["drama"],
      trackNumber: 3
    });
    assert.deepEqual(fake.last().metadata?.extras, {
      mediaType: "video",
      subtitle: "Part 2",
      genres: ["drama"],
      trackNumber: 3
    });
    const events: string[] = [];
    sessionOf().addEventListener("shufflechange", () => {
      events.push(`shuffle ${sessionOf().isShuffleEnabled}`);
    });
    sessionOf().onrepeatchange = () => {
      events.push(`repeat ${sessionOf().autoRepeatMode}`);
    };
    fake.raise({
      kind: "shuffle",
      isEnabled: true
    });
    fake.raise({
      kind: "repeat",
      mode: "list"
    });
    assert.deepEqual(events, ["shuffle true", "repeat list"]);
    sessionOf().isShuffleEnabled = false;
    sessionOf().update();
    assert.equal(fake.last().isShuffleEnabled, false);
    assert.equal(fake.last().autoRepeatMode, "list");
  });
});
