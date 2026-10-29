import type { StackEntry } from "./navigation-stack.ts";
import { NavigationCacheMode, NavigationMode, NavigationStack } from "./navigation-stack.ts";
import assert from "node:assert/strict";
import { test } from "node:test";

interface Entry extends StackEntry {
  readonly name: string;
}

function entry({ name, cacheMode = NavigationCacheMode.DISABLED }: {
  name: string;
  cacheMode?: NavigationCacheMode;
}) {
  return {
    name,
    cacheMode
  } satisfies Entry;
}

function names(entries: readonly Entry[]) {
  return entries.map(item => item.name);
}

test("an empty history has nowhere to go", () => {
  const stack = new NavigationStack<Entry>();
  assert.equal(stack.current, null);
  assert.equal(stack.canGoBack, false);
  assert.equal(stack.canGoForward, false);
  assert.equal(stack.goBack(), null);
  assert.equal(stack.goForward(), null);
});

test("navigating pushes the page and back and forward walk the history", () => {
  const stack = new NavigationStack<Entry>();
  const home = entry({ name: "home" });
  const settings = entry({ name: "settings" });
  const first = stack.navigate(home);
  assert.equal(first.mode, NavigationMode.NEW);
  assert.equal(first.from, null);
  assert.equal(stack.canGoBack, false);

  stack.navigate(settings);
  assert.equal(stack.current, settings);
  assert.equal(stack.canGoBack, true);
  assert.equal(stack.canGoForward, false);

  const back = stack.goBack();
  assert.equal(back?.mode, NavigationMode.BACK);
  assert.equal(back?.from, settings);
  assert.equal(back?.to, home);
  assert.equal(stack.canGoBack, false);
  assert.equal(stack.canGoForward, true);

  const forward = stack.goForward();
  assert.equal(forward?.mode, NavigationMode.FORWARD);
  assert.equal(forward?.to, settings);
  assert.equal(stack.canGoForward, false);
});

test("a new page after going back drops the pages that were forward", () => {
  const stack = new NavigationStack<Entry>();
  const required = NavigationCacheMode.REQUIRED;
  const home = entry({ name: "home", cacheMode: required });
  const settings = entry({ name: "settings", cacheMode: required });
  const about = entry({ name: "about", cacheMode: required });
  stack.navigate(home);
  stack.navigate(settings);
  stack.goBack();
  assert.equal(stack.isMounted(settings), true, "a required page stays mounted while it is only forward");

  const change = stack.navigate(about);
  assert.deepEqual(names(change.released), ["settings"], "the page the history no longer holds ends");
  assert.equal(stack.canGoForward, false);
  assert.equal(stack.isMounted(settings), false);
  assert.equal(stack.isMounted(home), true);
});

test("a disabled page ends when it is left, and a revisit finds it unmounted", () => {
  const stack = new NavigationStack<Entry>();
  const home = entry({ name: "home" });
  const settings = entry({ name: "settings" });
  stack.navigate(home);
  const change = stack.navigate(settings);
  assert.deepEqual(names(change.released), ["home"]);
  assert.equal(stack.isMounted(home), false);

  const back = stack.goBack();
  assert.equal(back?.to, home);
  assert.equal(stack.isMounted(home), true, "going back mounts it again");
  assert.deepEqual(names(back?.released ?? []), ["settings"]);
});

test("a required page is kept however many pages follow, and an enabled one while the cache holds it", () => {
  const stack = new NavigationStack<Entry>({ cacheSize: () => 1 });
  const required = entry({
    name: "required",
    cacheMode: NavigationCacheMode.REQUIRED
  });
  const older = entry({
    name: "older",
    cacheMode: NavigationCacheMode.ENABLED
  });
  const newer = entry({
    name: "newer",
    cacheMode: NavigationCacheMode.ENABLED
  });
  stack.navigate(required);
  stack.navigate(older);
  assert.deepEqual(names(stack.navigate(newer).released), [], "one enabled page fits the cache");
  const change = stack.navigate(entry({ name: "last" }));
  assert.deepEqual(names(change.released), ["older"], "the least recently shown enabled page goes");
  assert.equal(stack.isMounted(required), true);
  assert.equal(stack.isMounted(newer), true);
});

test("the cache counts when a page was last shown, not when it was made", () => {
  const stack = new NavigationStack<Entry>({ cacheSize: () => 1 });
  const enabled = NavigationCacheMode.ENABLED;
  const first = entry({ name: "first", cacheMode: enabled });
  const second = entry({ name: "second", cacheMode: enabled });
  stack.navigate(first);
  stack.navigate(second);
  stack.goBack();
  const change = stack.navigate(entry({ name: "third" }));
  assert.deepEqual(names(change.released), ["second"], "first was shown after second");
  assert.equal(stack.isMounted(first), true);
});

test("the cache size is read at each step", () => {
  let size = 2;
  const stack = new NavigationStack<Entry>({ cacheSize: () => size });
  const enabled = NavigationCacheMode.ENABLED;
  stack.navigate(entry({ name: "a", cacheMode: enabled }));
  stack.navigate(entry({ name: "b", cacheMode: enabled }));
  assert.deepEqual(names(stack.navigate(entry({ name: "c", cacheMode: enabled })).released), []);
  size = 1;
  assert.deepEqual(names(stack.navigate(entry({ name: "d" })).released), ["a", "b"]);
});

test("the same page navigated to twice is two entries of the history", () => {
  const stack = new NavigationStack<Entry>();
  stack.navigate(entry({ name: "home" }));
  stack.navigate(entry({ name: "home" }));
  assert.equal(stack.canGoBack, true);
  stack.goBack();
  assert.equal(stack.canGoBack, false);
  assert.equal(stack.canGoForward, true);
});
