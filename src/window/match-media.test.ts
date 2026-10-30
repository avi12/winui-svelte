import { fakeInputs } from "#src/css/media/fake-inputs.js";
import type { MediaChange, MediaInputs, MediaStore } from "#src/css/media/features.js";
import "#src/state/test-support/svelte-runes.js";
import assert from "node:assert/strict";
import { test } from "node:test";

// matchMedia and the reactive mediaQuery over a fake store: the web's
// MediaQueryList shape, change events when the answer flips, and no listening
// to Windows while nobody listens.

const { flushSync, tick } = await import("svelte");
const { createMatchMedia, installMatchMedia } = await import("./match-media.ts");
const { observeMediaQuery } = await import("./media-query.svelte.ts");
const { track } = await import("#src/state/test-support/track.svelte.js");

class FakeStore implements MediaStore {
  isReduced = false;
  isDark = false;
  subscriptions = 0;
  private readonly callbacks = new Set<() => void>();

  get inputs() {
    const overrides: Partial<MediaInputs> = {
      isAnimationEnabled: () => !this.isReduced,
      isDark: () => this.isDark
    };
    return fakeInputs(overrides);
  }

  subscribe({ changes, callback }: {
    changes: ReadonlySet<MediaChange>;
    callback: () => void;
  }) {
    assert.ok(changes.has("settings"), "only a settings query is asked about here");
    this.subscriptions++;
    this.callbacks.add(callback);
    return () => {
      this.subscriptions--;
      this.callbacks.delete(callback);
    };
  }

  raise() {
    for (const callback of this.callbacks) {
      callback();
    }
  }
}

test("a MediaQueryList has the web's shape and reads live", () => {
  const store = new FakeStore();
  const list = createMatchMedia(store)("(prefers-reduced-motion: reduce)");
  assert.equal(list.media, "(prefers-reduced-motion: reduce)");
  assert.equal(list.matches, false);
  store.isReduced = true;
  assert.equal(list.matches, true);
  assert.equal(store.subscriptions, 0, "nobody listens, so nothing is subscribed");
});

test("change events reach addEventListener, the legacy addListener and onchange only when the answer flips", () => {
  const store = new FakeStore();
  const list = createMatchMedia(store)("(prefers-color-scheme: dark)");
  const seen: boolean[] = [];
  const legacy: boolean[] = [];
  const handled: boolean[] = [];
  function listener(event: { matches: boolean }) {
    seen.push(event.matches);
  }
  list.addEventListener("change", listener);
  list.addListener(event => legacy.push(event.matches));
  list.onchange = event => handled.push(event.matches);
  assert.equal(store.subscriptions, 1, "one subscription however many listeners");

  store.raise();
  assert.deepEqual(seen, [], "nothing flipped");
  store.isDark = true;
  store.raise();
  store.raise();
  assert.deepEqual(seen, [true]);
  assert.deepEqual(legacy, [true]);
  assert.deepEqual(handled, [true]);

  list.removeEventListener("change", listener);
  store.isDark = false;
  store.raise();
  assert.deepEqual(seen, [true], "a removed listener hears nothing");
  assert.deepEqual(legacy, [true, false]);
});

test("the store is released when the last listener goes", () => {
  const store = new FakeStore();
  const list = createMatchMedia(store)("(prefers-color-scheme: dark)");
  function listener() {}
  list.addEventListener("change", listener);
  list.onchange = () => undefined;
  list.removeEventListener("change", listener);
  assert.equal(store.subscriptions, 1, "onchange still listens");
  list.onchange = null;
  assert.equal(store.subscriptions, 0);
});

test("installMatchMedia puts matchMedia on globalThis and takes it away again, never at import", () => {
  const host: { matchMedia?: unknown } = globalThis;
  assert.equal(host.matchMedia, undefined);
  const uninstall = installMatchMedia({ store: new FakeStore() });
  assert.equal(typeof host.matchMedia, "function");
  uninstall();
  assert.equal(host.matchMedia, undefined);
});

test("mediaQuery is a reactive boolean that follows the settings", async () => {
  const store = new FakeStore();
  const reduced = observeMediaQuery({
    store,
    query: "(prefers-reduced-motion: reduce)"
  });
  const tracked = track(() => reduced.matches);
  store.isReduced = true;
  store.raise();
  flushSync();
  assert.deepEqual(tracked.values, [false, true]);
  tracked.stop();
  await tick();
  assert.equal(store.subscriptions, 0);
});
