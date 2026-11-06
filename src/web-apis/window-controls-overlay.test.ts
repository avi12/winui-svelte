import type { TitleBarReading } from "./window-controls-overlay.ts";
import assert from "node:assert/strict";
import { test } from "node:test";

// The title bar area as navigator.windowControlsOverlay has it, over a
// stand-in title bar: the rectangle in CSS pixels, zero while the content
// stays below the bar, and geometrychange only when the area changes. The
// real window is for test/window.test.ts.

const { WindowControlsOverlay, WindowControlsOverlayGeometryChangeEvent } = await import("./window-controls-overlay.ts");

const SCALE = 1.5;

function fakeTitleBar(overrides: Partial<TitleBarReading> = {}) {
  let reading: TitleBarReading = {
    isVisible: true,
    leftInset: 0,
    rightInset: 207,
    titleBarHeight: 48,
    clientWidth: 1500,
    scale: SCALE,
    ...overrides
  };
  let notify: (() => void) | undefined;
  let stops = 0;
  return {
    source: {
      read: () => reading,
      watch(callback: () => void) {
        notify = callback;
        return () => {
          stops += 1;
        };
      }
    },
    change(changes: Partial<TitleBarReading>) {
      reading = {
        ...reading,
        ...changes
      };
      notify?.();
    },
    get stops() {
      return stops;
    }
  };
}

test("the area is the client width minus the system's insets, in CSS pixels", () => {
  const titleBar = fakeTitleBar();
  const overlay = new WindowControlsOverlay(titleBar.source);
  assert.equal(overlay.visible, true);
  assert.deepEqual(overlay.getTitlebarAreaRect(), {
    x: 0,
    y: 0,
    width: 862,
    height: 32,
    left: 0,
    top: 0,
    right: 862,
    bottom: 32
  });
});

test("a right-to-left window has its inset on the left", () => {
  const overlay = new WindowControlsOverlay(fakeTitleBar({
    leftInset: 207,
    rightInset: 0
  }).source);
  const rect = overlay.getTitlebarAreaRect();
  assert.equal(rect.x, 138);
  assert.equal(rect.width, 862);
});

test("the area is empty while the content stays below the title bar", () => {
  const overlay = new WindowControlsOverlay(fakeTitleBar({ isVisible: false }).source);
  assert.equal(overlay.visible, false);
  assert.equal(overlay.getTitlebarAreaRect().width, 0);
});

test("geometrychange fires when the area or visibility changes, and not otherwise", () => {
  const titleBar = fakeTitleBar();
  const overlay = new WindowControlsOverlay(titleBar.source);
  const seen: string[] = [];
  overlay.ongeometrychange = event => {
    assert.ok(event instanceof WindowControlsOverlayGeometryChangeEvent);
    seen.push(`${event.titlebarAreaRect.width} ${event.visible}`);
  };
  titleBar.change({ titleBarHeight: 48 });
  titleBar.change({ clientWidth: 1800 });
  titleBar.change({ isVisible: false });
  assert.deepEqual(seen, ["1062 true", "0 false"]);
  overlay.dispose();
  assert.equal(titleBar.stops, 1);
});
