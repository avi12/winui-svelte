import { bracketPath, handlePoints, pointsText, scrimPath } from "./overlay-geometry.ts";
import assert from "node:assert/strict";
import { test } from "node:test";

const SCREEN = {
  width: 100,
  height: 80
};

test("scrimPath is the whole area when nothing is selected", () => {
  assert.equal(
    scrimPath({
      screen: SCREEN,
      selection: undefined
    }), "F0 M0,0 H100 V80 H0 Z"
  );
});

test("scrimPath cuts the selection out with an even-odd fill", () => {
  const path = scrimPath({
    screen: SCREEN,
    selection: {
      x: 10,
      y: 10,
      width: 40,
      height: 30
    },
    radius: 5
  });
  assert.ok(path.startsWith("F0 M0,0 H100 V80 H0 Z M15,10 H45 A5,5 0 0 1 50,15"));
  assert.ok(path.endsWith("A5,5 0 0 1 15,10 Z"));
});

test("bracketPath draws four arms and shrinks them for a small selection", () => {
  const path = bracketPath({
    size: {
      width: 20,
      height: 100
    },
    arm: 44,
    radius: 24
  });
  assert.equal(path.split("M").length - 1, 4);
  assert.ok(path.startsWith("M0,10 V10 A10,10 0 0 1 10,0 H10"));
});

test("pointsText joins pairs", () => {
  assert.equal(
    pointsText([
      {
        x: 1,
        y: 2
      },
      {
        x: 3.5,
        y: 4
      }
    ]), "1,2 3.5,4"
  );
});

test("handlePoints are the four corners and the four edge middles", () => {
  const points = handlePoints({
    x: 10,
    y: 20,
    width: 100,
    height: 60
  });
  assert.equal(points.length, 8);
  assert.deepEqual(points.find(point => point.name === "top"), {
    name: "top",
    x: 60,
    y: 20
  });
  assert.deepEqual(points.find(point => point.name === "bottom-right"), {
    name: "bottom-right",
    x: 110,
    y: 80
  });
  assert.deepEqual(points.find(point => point.name === "left"), {
    name: "left",
    x: 10,
    y: 50
  });
});
