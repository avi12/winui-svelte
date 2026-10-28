import { poseAt, readDeclarations, readKeyframe, touchedFields } from "./keyframes.ts";
import assert from "node:assert/strict";
import { test } from "node:test";

// What a transition's keyframes say, read into WinUI's four animated
// properties.

test("opacity is a number or a percentage, kept between 0 and 1", () => {
  assert.deepEqual(readKeyframe({ opacity: 0.25 }).pose, { opacity: 0.25 });
  assert.deepEqual(readKeyframe({ opacity: "50%" }).pose, { opacity: 0.5 });
  assert.deepEqual(readKeyframe({ opacity: "-0.0001" }).pose, { opacity: 0 });
});

test("transform composes translate, scale and rotate in order", () => {
  const { pose, unsupported } = readKeyframe({ transform: "translate(10px, 4px) scale(0.5) rotate(90deg) translateX(2px)" });
  assert.deepEqual(unsupported, []);
  assert.deepEqual(pose.translation, {
    x: 12,
    y: 4,
    z: 0
  });
  assert.deepEqual(pose.scale, {
    x: 0.5,
    y: 0.5,
    z: 1
  });
  assert.equal(pose.rotation, 90);
});

test("the translate, scale and rotate properties are read like their functions", () => {
  const { pose } = readKeyframe({
    translate: "1px 2px",
    scale: "2 3",
    rotate: "-30deg"
  });
  assert.deepEqual(pose, {
    translation: {
      x: 1,
      y: 2,
      z: 0
    },
    scale: {
      x: 2,
      y: 3,
      z: 1
    },
    rotation: -30
  });
});

test("a property or a value WinUI cannot take is named and the rest is kept", () => {
  const { pose, unsupported } = readKeyframe({
    opacity: 1,
    height: "10px",
    transform: "skew(10deg)",
    overflow: "hidden",
    offset: 0.5,
    easing: "linear"
  });
  assert.deepEqual(pose, { opacity: 1 });
  assert.deepEqual(unsupported, ["height", "transform"]);
  assert.deepEqual(readKeyframe({ transform: "none" }).pose, {});
  assert.deepEqual(readKeyframe({ transform: "translate(NaNpx, 0px)" }).unsupported, ["transform"]);
});

test("css(t, u) text is read declaration by declaration, in camelCase", () => {
  assert.deepEqual(readDeclarations("opacity: 0.5; padding-top: 4px;min-height: 0"), {
    opacity: "0.5",
    paddingTop: "4px",
    minHeight: "0"
  });
});

test("keyframes are spaced evenly and interpolated linearly", () => {
  const poses = [{ opacity: 0 }, { opacity: 1 }, { opacity: 0.5 }];
  assert.deepEqual(
    poseAt({
      poses,
      progress: 0
    }), { opacity: 0 }
  );
  assert.deepEqual(
    poseAt({
      poses,
      progress: 0.25
    }), { opacity: 0.5 }
  );
  assert.deepEqual(
    poseAt({
      poses,
      progress: 1
    }), { opacity: 0.5 }
  );
  assert.deepEqual(
    poseAt({
      poses: [],
      progress: 0.5
    }), {}
  );
});

test("a field only some keyframes set holds the value of the one that has it", () => {
  const poses = [{ opacity: 0 }, {
    opacity: 1,
    rotation: 90
  }];
  assert.deepEqual(
    poseAt({
      poses,
      progress: 0.5
    }), {
      opacity: 0.5,
      rotation: 90
    }
  );
  assert.deepEqual([...touchedFields(poses)].toSorted(), ["opacity", "rotation"]);
});
