import { shadowFrame, shadowReach } from "./shadow-geometry.ts";
import assert from "node:assert/strict";
import { test } from "node:test";

const SIZE = {
  width: 100,
  height: 40
};
const LAYER = {
  x: 4,
  y: 8,
  blur: 12,
  spread: 0,
  color: "#80000000"
};

function bounds(commands: ReadonlyArray<{
  kind: string;
  x?: number;
  y?: number;
}>) {
  const horizontals = commands.flatMap(command => command.x === undefined ? [] : [command.x]);
  const verticals = commands.flatMap(command => command.y === undefined ? [] : [command.y]);
  return {
    left: Math.min(...horizontals),
    top: Math.min(...verticals),
    right: Math.max(...horizontals),
    bottom: Math.max(...verticals)
  };
}

test("a layer is a rectangle of the element's size, shifted and blurred by the shadow", () => {
  const frame = shadowFrame({
    layer: LAYER,
    size: SIZE
  });
  assert.deepEqual(frame.size, {
    x: 100,
    y: 40
  });
  assert.deepEqual(frame.offset, {
    x: 0,
    y: 0,
    z: 0
  });
  assert.deepEqual(frame.shadowOffset, {
    x: 4,
    y: 8,
    z: 0
  });
  assert.equal(frame.blurRadius, 12);
  assert.equal(frame.isVisible, true);
});

test("a spread grows the rectangle on every side and moves it back by as much", () => {
  const frame = shadowFrame({
    layer: {
      ...LAYER,
      spread: 5
    },
    size: SIZE
  });
  assert.deepEqual(frame.size, {
    x: 110,
    y: 50
  });
  assert.deepEqual(frame.offset, {
    x: -5,
    y: -5,
    z: 0
  });
});

test("a negative spread that eats the element leaves nothing to draw", () => {
  const frame = shadowFrame({
    layer: {
      ...LAYER,
      spread: -30
    },
    size: SIZE
  });
  assert.equal(frame.isVisible, false);
  assert.deepEqual(frame.size, {
    x: 40,
    y: 0
  });
});

test("the clip is an even-odd path: a field around the shadow with the element's border box as the hole", () => {
  const frame = shadowFrame({
    layer: LAYER,
    size: SIZE
  });
  assert.equal(frame.clip.rule, "evenodd");
  const reach = shadowReach(LAYER);
  assert.equal(reach, 8 + 18);
  const closes = frame.clip.commands.filter(command => command.kind === "close");
  assert.equal(closes.length, 2);
  const [outer, hole] = [frame.clip.commands.slice(0, 5), frame.clip.commands.slice(5)];
  assert.deepEqual(bounds(hole), {
    left: 0,
    top: 0,
    right: 100,
    bottom: 40
  });
  assert.deepEqual(bounds(outer), {
    left: -reach,
    top: -reach,
    right: 100 + reach,
    bottom: 40 + reach
  });
});

test("the reach of a shadow with no blur and no offset is zero", () => {
  assert.equal(
    shadowReach({
      ...LAYER,
      x: 0,
      y: 0,
      blur: 0
    }), 0
  );
});
