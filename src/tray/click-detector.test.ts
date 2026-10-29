import { createClickDetector, TrayGesture } from "./click-detector.ts";
import type { TrayPointerEvent } from "./click-detector.ts";
import type { ButtonSample, PointerSample, ScreenRect } from "./native.ts";
import assert from "node:assert/strict";
import { test } from "node:test";

const ICON: ScreenRect = {
  left: 100,
  top: 100,
  right: 132,
  bottom: 132
};
const INSIDE = 110;
const OUTSIDE = 500;
const DOUBLE_CLICK_MILLISECONDS = 500;
const RELEASED: ButtonSample = {
  isDown: false,
  wasPressed: false
};
const DOWN: ButtonSample = {
  isDown: true,
  wasPressed: true
};
const TAPPED: ButtonSample = {
  isDown: false,
  wasPressed: true
};

function sampleOf({ x, left = RELEASED, right = RELEASED, middle = RELEASED }: {
  x: number;
  left?: ButtonSample;
  right?: ButtonSample;
  middle?: ButtonSample;
}) {
  const sample: PointerSample = {
    x,
    y: x,
    left,
    right,
    middle,
    isOnTray: true
  };
  return sample;
}

function detectorWithClock() {
  const heard: TrayPointerEvent[] = [];
  let time = 0;
  const detector = createClickDetector({
    now: () => time,
    doubleClickMilliseconds: DOUBLE_CLICK_MILLISECONDS,
    onGesture: event => heard.push(event)
  });
  return {
    heard,
    advance(milliseconds: number) {
      time += milliseconds;
    },
    feed: (sample: PointerSample) => detector.feed({
      sample,
      rect: ICON
    })
  };
}

test("a press and a release over the icon is a click with the pointer's place", () => {
  const { heard, feed } = detectorWithClock();
  feed(
    sampleOf({
      x: INSIDE,
      left: DOWN
    })
  );
  assert.deepEqual(heard, [], "nothing until the button is released");
  feed(sampleOf({ x: INSIDE }));
  assert.deepEqual(heard, [{
    gesture: TrayGesture.click,
    x: INSIDE,
    y: INSIDE
  }]);
});

test("a click shorter than one poll is still heard from the pressed-since bit", () => {
  const { heard, feed } = detectorWithClock();
  feed(
    sampleOf({
      x: INSIDE,
      left: TAPPED
    })
  );
  assert.deepEqual(heard.map(event => event.gesture), [TrayGesture.click]);
});

test("a press that starts elsewhere and ends over the icon is no click", () => {
  const { heard, feed } = detectorWithClock();
  feed(
    sampleOf({
      x: OUTSIDE,
      left: DOWN
    })
  );
  feed(sampleOf({ x: INSIDE }));
  assert.deepEqual(heard, []);
});

test("a press over the icon released elsewhere is no click", () => {
  const { heard, feed } = detectorWithClock();
  feed(
    sampleOf({
      x: INSIDE,
      left: DOWN
    })
  );
  feed(sampleOf({ x: OUTSIDE }));
  assert.deepEqual(heard, []);
});

test("the right button is a context menu and the middle button a middle click", () => {
  const { heard, feed } = detectorWithClock();
  feed(
    sampleOf({
      x: INSIDE,
      right: DOWN
    })
  );
  feed(sampleOf({ x: INSIDE }));
  feed(
    sampleOf({
      x: INSIDE,
      middle: DOWN
    })
  );
  feed(sampleOf({ x: INSIDE }));
  assert.deepEqual(heard.map(event => event.gesture), [TrayGesture.contextMenu, TrayGesture.middleClick]);
});

test("two left clicks within the double-click time add a double click, a slow second does not", () => {
  const { heard, feed, advance } = detectorWithClock();
  function click() {
    feed(
      sampleOf({
        x: INSIDE,
        left: DOWN
      })
    );
    feed(sampleOf({ x: INSIDE }));
  }
  click();
  advance(DOUBLE_CLICK_MILLISECONDS / 2);
  click();
  assert.deepEqual(heard.map(event => event.gesture), [TrayGesture.click, TrayGesture.click, TrayGesture.doubleClick]);
  heard.length = 0;
  advance(DOUBLE_CLICK_MILLISECONDS * 2);
  click();
  advance(DOUBLE_CLICK_MILLISECONDS * 2);
  click();
  assert.deepEqual(heard.map(event => event.gesture), [TrayGesture.click, TrayGesture.click]);
});

test("without a known rectangle nothing is a click", () => {
  const heard: TrayPointerEvent[] = [];
  const detector = createClickDetector({
    now: () => 0,
    doubleClickMilliseconds: DOUBLE_CLICK_MILLISECONDS,
    onGesture: event => heard.push(event)
  });
  detector.feed({
    sample: sampleOf({
      x: INSIDE,
      left: DOWN
    }),
    rect: null
  });
  detector.feed({
    sample: sampleOf({ x: INSIDE }),
    rect: null
  });
  assert.deepEqual(heard, []);
});
