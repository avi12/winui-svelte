import type { ChromeWindowSurface } from "./window-surface.ts";
import type { WindowState as WindowStateName } from "./window-types.ts";
import type { WindowBounds } from "#src/window/anchor.js";
import assert from "node:assert/strict";
import { test } from "node:test";

// chrome.windows over fake windows: nothing real is opened.

const { createChromeWindows } = await import("./create-chrome-windows.ts");
const { WINDOW_ID_CURRENT, WINDOW_ID_NONE, WindowState } = await import("./window-types.ts");

interface FakeState {
  bounds: WindowBounds;
  windowState: WindowStateName;
  isFocused: boolean;
  attention: boolean;
  isClosed: boolean;
}

function fakeSurface() {
  const state: FakeState = {
    bounds: {
      x: 10,
      y: 20,
      width: 800,
      height: 600
    },
    windowState: WindowState.normal,
    isFocused: false,
    attention: false,
    isClosed: false
  };
  const focusListeners: Array<(isFocused: boolean) => void> = [];
  const boundsListeners: Array<() => void> = [];
  const closedListeners: Array<() => void> = [];
  const surface: ChromeWindowSurface = {
    bounds: () => state.bounds,
    state: () => state.windowState,
    isFocused: () => state.isFocused,
    isAlwaysOnTop: () => false,
    setBounds(changes) {
      state.bounds = {
        ...state.bounds,
        ...changes
      };
    },
    setState(next) {
      state.windowState = next;
    },
    focus() {
      state.isFocused = true;
    },
    drawAttention(isOn) {
      state.attention = isOn;
    },
    close() {
      state.isClosed = true;
      for (const listener of closedListeners) {
        listener();
      }
    },
    onFocusChanged(listener) {
      focusListeners.push(listener);
      return () => {};
    },
    onBoundsChanged(listener) {
      boundsListeners.push(listener);
      return () => {};
    },
    onClosed(listener) {
      closedListeners.push(listener);
      return () => {};
    }
  };
  return {
    surface,
    state,
    setFocus(isFocused: boolean) {
      state.isFocused = isFocused;
      for (const listener of focusListeners) {
        listener(isFocused);
      }
    },
    moved() {
      for (const listener of boundsListeners) {
        listener();
      }
    }
  };
}

test("track gives ids, fires onCreated, and getAll lists in order", async () => {
  const windows = createChromeWindows();
  const created: number[] = [];
  windows.onCreated.addListener(window => created.push(window.id));
  const first = windows.track({ surface: fakeSurface().surface });
  const second = windows.track({ surface: fakeSurface().surface });
  assert.deepEqual([first.id, second.id], [1, 2]);
  assert.deepEqual(created, [1, 2]);
  assert.deepEqual((await windows.getAll()).map(window => window.id), [1, 2]);
  assert.equal(first.left, 10);
  assert.equal(first.type, "normal");
  assert.equal(first.incognito, false);
});

test("get rejects an unknown id, and WINDOW_ID_CURRENT finds the current window", async () => {
  const windows = createChromeWindows();
  await assert.rejects(windows.get(7), /No window with id: 7/u);
  windows.track({ surface: fakeSurface().surface });
  const current = windows.track({
    surface: fakeSurface().surface,
    isCurrent: true
  });
  assert.equal((await windows.get(WINDOW_ID_CURRENT)).id, current.id);
  assert.equal((await windows.getCurrent()).id, current.id);
});

test("focus changes fire onFocusChanged with the id, then WINDOW_ID_NONE", async () => {
  const windows = createChromeWindows();
  const one = fakeSurface();
  const two = fakeSurface();
  windows.track({ surface: one.surface });
  windows.track({ surface: two.surface });
  const seen: number[] = [];
  windows.onFocusChanged.addListener(id => seen.push(id));
  one.setFocus(true);
  one.setFocus(false);
  two.setFocus(true);
  assert.deepEqual(seen, [1, WINDOW_ID_NONE, 2]);
  assert.equal((await windows.getLastFocused()).id, 2);
});

test("update moves a normal window and flashes it", async () => {
  const windows = createChromeWindows();
  const fake = fakeSurface();
  const { id } = windows.track({ surface: fake.surface });
  const updated = await windows.update(id, {
    left: 0,
    width: 1024,
    drawAttention: true,
    focused: true
  });
  assert.deepEqual(fake.state.bounds, {
    x: 0,
    y: 20,
    width: 1024,
    height: 600
  });
  assert.equal(updated.width, 1024);
  assert.equal(fake.state.attention, true);
  assert.equal(updated.focused, true);
});

test("update changes the state and refuses a place outside normal", async () => {
  const windows = createChromeWindows();
  const fake = fakeSurface();
  const { id } = windows.track({ surface: fake.surface });
  assert.equal((await windows.update(id, { state: WindowState.maximized })).state, "maximized");
  await assert.rejects(
    windows.update(id, {
      state: WindowState.maximized,
      left: 5
    }), /must be normal/u
  );
  await assert.rejects(
    windows.update(id, {
      state: WindowState.minimized,
      focused: true
    }), /cannot be focused/u
  );
  // @ts-expect-error -- a caller from plain JavaScript can pass a string, which the schema must refuse
  await assert.rejects(windows.update(id, { width: "wide" }));
});

test("onBoundsChanged fires with the window", async () => {
  const windows = createChromeWindows();
  const fake = fakeSurface();
  const { id } = windows.track({ surface: fake.surface });
  const seen: number[] = [];
  windows.onBoundsChanged.addListener(window => seen.push(window.width));
  fake.state.bounds = {
    ...fake.state.bounds,
    width: 900
  };
  fake.moved();
  assert.deepEqual(seen, [900]);
  assert.equal((await windows.get(id)).width, 900);
});

test("remove closes the window and onRemoved fires once it has closed", async () => {
  const windows = createChromeWindows();
  const fake = fakeSurface();
  const { id } = windows.track({ surface: fake.surface });
  const removed: number[] = [];
  windows.onRemoved.addListener(windowId => removed.push(windowId));
  await windows.remove(id);
  assert.equal(fake.state.isClosed, true);
  assert.deepEqual(removed, [id]);
  assert.deepEqual(await windows.getAll(), []);
  await assert.rejects(windows.getLastFocused(), /No last focused window/u);
});

test("create opens through the open option and applies the data", async () => {
  const fake = fakeSurface();
  const windows = createChromeWindows({
    async open(data) {
      assert.equal(data.type, "popup");
      return fake.surface;
    }
  });
  const window = await windows.create({
    type: "popup",
    width: 300,
    height: 200,
    left: 1,
    top: 2,
    state: WindowState.normal
  });
  assert.equal(window.id, 1);
  assert.deepEqual(fake.state.bounds, {
    x: 1,
    y: 2,
    width: 300,
    height: 200
  });
});

test("create rejects without an open option", async () => {
  await assert.rejects(createChromeWindows().create(), /open option/u);
});
