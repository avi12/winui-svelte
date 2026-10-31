import { defineProperty } from "./install.ts";
import type { PageBackend, PageListener, PageSnapshot, WindowState } from "./page.ts";
import { read } from "#src/renderer/host/reflect.js";
import { createTreeRenderer } from "#src/renderer/tree/tree.js";
import assert from "node:assert/strict";
import { test } from "node:test";

// The page over a stand-in window: visibility and focus with their events,
// fullscreen from an element and back (and when the window refuses), title,
// close and open, the beforeunload veto, and the window-state extras. The real
// window is for test/page.test.ts.

const { installPage, usePageWindow } = await import("./page.ts");

function fakeWindow(overrides: Partial<PageSnapshot> = {}) {
  let snapshot: PageSnapshot = {
    isVisible: true,
    isFocused: true,
    state: "normal",
    title: "Window",
    isClosed: false,
    ...overrides
  };
  const calls: string[] = [];
  let listener: PageListener | undefined;
  let isRefusing = false;
  const backend = {
    read: () => snapshot,
    subscribe(next) {
      listener = next;
      return () => {
        listener = undefined;
      };
    },
    setState(state) {
      calls.push(`state ${state}`);

      if (!isRefusing) {
        snapshot = {
          ...snapshot,
          state
        };
      }
    },
    setTitle(title) {
      calls.push(`title ${title}`);
      snapshot = {
        ...snapshot,
        title
      };
    },
    close() {
      calls.push("close");
    },
    open(url) {
      calls.push(`open ${url}`);
    }
  } satisfies PageBackend;
  return {
    backend,
    calls,
    set(changes: Partial<PageSnapshot>) {
      snapshot = {
        ...snapshot,
        ...changes
      };
      listener?.changed();
    },
    refuse() {
      isRefusing = true;
    },
    closing() {
      return listener?.closing() ?? false;
    },
    closed() {
      listener?.closed();
    }
  };
}

function createElement() {
  const tree = createTreeRenderer<object>({
    create: () => ({}),
    setAttribute() {},
    removeAttribute() {},
    childrenChanged() {},
    fragmentChanged() {},
    removed() {},
    listen: () => null
  });
  return tree.createElement("border");
}

async function requestFullscreen(element: object) {
  const request = read(element, "requestFullscreen");
  const isDefined = typeof request === "function";
  if (!isDefined) {
    throw new TypeError("requestFullscreen is not defined on the element");
  }

  await request.call(element);
}

function listen({ target, types }: {
  target: EventTarget;
  types: string[];
}) {
  const seen: string[] = [];
  for (const type of types) {
    target.addEventListener(type, () => seen.push(type));
  }

  return seen;
}

test("visibility and focus follow the window, with their events", () => {
  const window = fakeWindow();
  const uninstall = installPage({ backend: window.backend });
  assert.equal(document.visibilityState, "visible");
  assert.equal(document.hidden, false);
  assert.equal(document.hasFocus(), true);
  const events: string[] = [];
  document.addEventListener("visibilitychange", () => events.push(`visibility ${document.visibilityState}`));
  globalThis.addEventListener("blur", () => events.push("blur"));
  globalThis.addEventListener("focus", () => events.push("focus"));
  window.set({
    isVisible: false,
    isFocused: false
  });
  window.set({
    isVisible: true,
    isFocused: true
  });
  window.set({ title: "Same visibility, same focus" });
  assert.deepEqual(events, ["visibility hidden", "blur", "visibility visible", "focus"]);
  uninstall();
});

test("the on... properties are the listeners they say", () => {
  const window = fakeWindow();
  const uninstall = installPage({ backend: window.backend });
  const events: string[] = [];
  document.onvisibilitychange = () => events.push("on");
  window.set({ isVisible: false });
  document.onvisibilitychange = null;
  window.set({ isVisible: true });
  assert.deepEqual(events, ["on"]);
  uninstall();
});

test("an element requests fullscreen, the document exits it, and both fire fullscreenchange", async () => {
  const window = fakeWindow();
  const uninstall = installPage({ backend: window.backend });
  const element = createElement();
  const changes: Array<object | null> = [];
  document.addEventListener("fullscreenchange", () => changes.push(document.fullscreenElement));
  assert.equal(document.fullscreenEnabled, true);
  assert.equal(document.fullscreenElement, null);
  await requestFullscreen(element);
  assert.equal(document.fullscreenElement, element);
  assert.equal(document.windowState, "fullscreen");
  await document.exitFullscreen();
  assert.equal(document.fullscreenElement, null);
  assert.deepEqual(changes, [element, null]);
  assert.deepEqual(window.calls, ["state fullscreen", "state normal"]);
  await assert.rejects(document.exitFullscreen(), TypeError);
  uninstall();
});

test("a window that will not go fullscreen fails with fullscreenerror", async () => {
  const window = fakeWindow();
  const uninstall = installPage({ backend: window.backend });
  window.refuse();
  const errors: string[] = [];
  document.addEventListener("fullscreenerror", () => errors.push("error"));
  await assert.rejects(requestFullscreen(createElement()), TypeError);
  assert.deepEqual(errors, ["error"]);
  assert.equal(document.fullscreenElement, null);
  uninstall();
});

test("the title, close and open go to the window", () => {
  const window = fakeWindow();
  const uninstall = installPage({ backend: window.backend });
  assert.equal(document.title, "Window");
  document.title = "Renamed";
  assert.equal(document.title, "Renamed");
  globalThis.close();
  assert.equal(globalThis.open("https://example.com"), null);
  assert.equal(globalThis.closed, false);
  assert.deepEqual(window.calls, ["title Renamed", "close", "open https://example.com"]);
  uninstall();
});

test("beforeunload can keep the window open, and a closed window says pagehide and unload", () => {
  const window = fakeWindow();
  const uninstall = installPage({ backend: window.backend });
  assert.equal(window.closing(), false);
  function handler(event: Event) {
    event.preventDefault();
  }

  globalThis.addEventListener("beforeunload", handler);
  assert.equal(window.closing(), true);
  globalThis.removeEventListener("beforeunload", handler);
  assert.equal(window.closing(), false);
  const seen = listen({
    target: globalThis,
    types: ["pagehide", "unload"]
  });
  window.closed();
  assert.deepEqual(seen, ["pagehide", "unload"]);
  uninstall();
});

test("requestWindowState reaches the compact overlay and the overlapped states", async () => {
  const window = fakeWindow();
  const uninstall = installPage({ backend: window.backend });
  const states: WindowState[] = ["compact-overlay", "maximized", "normal"];
  for (const state of states) {
    await document.requestWindowState?.(state);
    assert.equal(document.windowState, state);
  }

  assert.equal(document.hidden, false);
  window.set({
    state: "minimized",
    isVisible: false
  });
  assert.equal(document.hidden, true);
  uninstall();
});

test("installed after a document exists, it joins that document and leaves it as it was", () => {
  const existing = {};
  const restoreDocument = defineProperty({
    name: "document",
    value: existing
  });
  const window = fakeWindow();
  const uninstall = installPage({ backend: window.backend });
  assert.equal(globalThis.document, existing);
  const members: Record<string, unknown> = existing;
  assert.equal(members["visibilityState"], "visible");
  uninstall();
  assert.equal(members["visibilityState"], undefined);
  restoreDocument();
});

test("without a document it makes one that goes away again, and a window of your own has no handle to follow", () => {
  const uninstall = installPage();
  assert.equal(typeof document, "object");
  assert.equal(document.visibilityState, "hidden", "no window yet");
  uninstall();
  assert.equal(typeof globalThis.document, "undefined");
  const window = fakeWindow();
  const uninstallOwn = installPage({ backend: window.backend });
  assert.throws(() => usePageWindow(Object.create(null)), { name: "InvalidStateError" });
  uninstallOwn();
  assert.throws(() => usePageWindow(Object.create(null)), { name: "InvalidStateError" });
});
