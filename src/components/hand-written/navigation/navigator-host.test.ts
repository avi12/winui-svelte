import { NavigationCacheMode, NavigationMode } from "./navigation-stack.ts";
import type { NavigatedEvent, NavigatorHandle, PageSlot } from "./navigator-host.svelte.ts";
import { registerControls } from "#src/renderer/host/host.js";
import { fakeControls, FakePanel, FakeTextBlock } from "#src/renderer/testing/fake-controls.js";
import { svelteHooks } from "#src/vite/loader.js";
import assert from "node:assert/strict";
import { registerHooks } from "node:module";
import path from "node:path";
import { test } from "node:test";

// The navigator host (navigator-host.svelte.ts) run on stand-in controls: real
// page components mounted into a slot, ended when the cache lets them go.

registerControls(fakeControls);
registerHooks(svelteHooks(path.join(import.meta.dirname, "..", "..", "..", "renderer", "host", "host.ts")));
const { attachNavigator } = await import("./navigator-host.svelte.ts");
const { default: Page } = await import("#src/renderer/testing/Page.fixture.svelte");

function start(props: {
  cacheSize?: number;
} = {}) {
  const lines: string[] = [];
  const events: NavigatedEvent[] = [];
  const slot: PageSlot = { content: null };
  function log(line: string) {
    lines.push(line);
  }

  const attached = attachNavigator({
    slot,
    props: {
      ...props,
      onNavigated: event => events.push(event)
    }
  });
  function page(label: string) {
    return {
      page: Page,
      params: {
        label,
        log
      }
    };
  }
  return {
    handle: attached.handle,
    dispose: attached.dispose,
    slot,
    lines,
    events,
    page,
    cachedPage: (label: string) => ({
      page: {
        component: Page,
        cacheMode: NavigationCacheMode.REQUIRED
      },
      params: {
        label,
        log
      }
    })
  };
}

// Read afresh each time: an earlier assertion narrows the property's type.
function currentPage(handle: NavigatorHandle) {
  return handle.current?.page;
}

function textOf(slot: PageSlot) {
  const root = slot.content;
  assert.ok(root instanceof FakePanel);
  const [text] = root.children.items;
  assert.ok(text instanceof FakeTextBlock);
  return text.text;
}

test("navigating mounts the page into the slot with its params as props", () => {
  const app = start();
  assert.equal(app.handle.current, null);
  app.handle.navigate(app.page("home"));
  assert.equal(textOf(app.slot), "home 0");
  assert.deepEqual(app.lines, ["made home"]);
  assert.equal(currentPage(app.handle), Page);
  assert.equal(app.handle.canGoBack, false);
  app.dispose();
});

test("an uncached page ends when it is left and is made again on the way back", () => {
  const app = start();
  app.handle.navigate(app.page("home"));
  app.handle.navigate(app.page("settings"));
  assert.equal(textOf(app.slot), "settings 0");
  assert.deepEqual(app.lines, ["made home", "made settings", "ended home"]);
  assert.equal(app.handle.canGoBack, true);

  app.handle.goBack();
  assert.equal(textOf(app.slot), "home 0");
  assert.deepEqual(app.lines.slice(3), ["made home", "ended settings"]);
  assert.equal(app.handle.canGoForward, true);
  assert.deepEqual(app.events.map(event => event.mode), [NavigationMode.NEW, NavigationMode.NEW, NavigationMode.BACK]);
  app.dispose();
});

test("a required page keeps its component, and so its state, while the user is elsewhere", () => {
  const app = start();
  app.handle.navigate(app.cachedPage("home"));
  const root = app.slot.content;
  app.handle.navigate(app.page("settings"));
  assert.notEqual(app.slot.content, root);
  assert.deepEqual(app.lines, ["made home", "made settings"], "home did not end");

  app.handle.goBack();
  assert.equal(app.slot.content, root, "the same root is shown again");
  assert.deepEqual(app.lines, ["made home", "made settings", "ended settings"]);
  app.dispose();
});

test("a new page after going back ends the pages that were forward", () => {
  const app = start();
  app.handle.navigate(app.cachedPage("home"));
  app.handle.navigate(app.cachedPage("settings"));
  app.handle.goBack();
  app.handle.navigate(app.page("about"));
  assert.ok(app.lines.includes("ended settings"));
  assert.equal(app.handle.canGoForward, false);
  app.handle.goForward();
  assert.equal(textOf(app.slot), "about 0", "going forward with nothing forward changes nothing");
  app.dispose();
});

test("an enabled page stays only while the cache size holds it", () => {
  const app = start({ cacheSize: 1 });
  function enabled(label: string) {
    return {
      page: {
        component: Page,
        cacheMode: NavigationCacheMode.ENABLED
      },
      params: {
        label,
        log: (line: string) => app.lines.push(line)
      }
    };
  }

  app.handle.navigate(enabled("a"));
  app.handle.navigate(enabled("b"));
  app.handle.navigate(enabled("c"));
  assert.deepEqual(app.lines, ["made a", "made b", "made c", "ended a"]);
  app.dispose();
});

test("disposing ends every mounted page and empties the slot", () => {
  const app = start();
  app.handle.navigate(app.cachedPage("home"));
  app.handle.navigate(app.cachedPage("settings"));
  app.dispose();
  assert.equal(app.slot.content, null);
  assert.deepEqual(app.lines.slice(2).toSorted(), ["ended home", "ended settings"]);
});
