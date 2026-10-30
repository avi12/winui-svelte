import { parseClipPath, readClipShape, resolveClipShape } from "./clip-shapes.ts";
import assert from "node:assert/strict";
import { test } from "node:test";

const SIZE = {
  width: 200,
  height: 100
};

function shapeOf(text: string) {
  const result = parseClipPath(text);
  assert.ok(result.isValid, text);
  assert.ok(result.shape !== null, text);
  return result.shape;
}

test("none clips nothing", () => {
  assert.deepEqual(parseClipPath("none"), {
    isValid: true,
    shape: null
  });
});

test("a circle takes a radius and a position, and defaults to the closest side at the center", () => {
  assert.deepEqual(
    resolveClipShape({
      shape: shapeOf("circle(40px at 25% 50%)"),
      ...SIZE
    }), {
      kind: "ellipse",
      x: 50,
      y: 50,
      radiusX: 40,
      radiusY: 40
    }
  );
  assert.deepEqual(
    resolveClipShape({
      shape: shapeOf("circle()"),
      ...SIZE
    }), {
      kind: "ellipse",
      x: 100,
      y: 50,
      radiusX: 50,
      radiusY: 50
    }
  );
  assert.equal(
    resolveClipShape({
      shape: shapeOf("circle(farthest-side at left top)"),
      ...SIZE
    }).kind, "ellipse"
  );
});

test("a circle's percentage is of the root of the mean of the squares of the sides", () => {
  const resolved = resolveClipShape({
    shape: shapeOf("circle(50%)"),
    width: 100,
    height: 100
  });
  assert.equal(resolved.kind === "ellipse" ? resolved.radiusX : 0, 50);
});

test("an ellipse takes two radii in percent of each side", () => {
  assert.deepEqual(
    resolveClipShape({
      shape: shapeOf("ellipse(50% 25% at 50% 50%)"),
      ...SIZE
    }), {
      kind: "ellipse",
      x: 100,
      y: 50,
      radiusX: 100,
      radiusY: 25
    }
  );
});

test("a polygon takes a fill rule and points", () => {
  assert.deepEqual(
    resolveClipShape({
      shape: shapeOf("polygon(evenodd, 50% 0, 100% 100%, 0 100%)"),
      ...SIZE
    }), {
      kind: "polygon",
      rule: "evenodd",
      points: [
        {
          x: 100,
          y: 0
        },
        {
          x: 200,
          y: 100
        },
        {
          x: 0,
          y: 100
        }
      ]
    }
  );
});

test("a path keeps its data, parsed when resolved", () => {
  const resolved = resolveClipShape({
    shape: shapeOf("path('M 0 0 L 10 0 L 10 10 Z')"),
    ...SIZE
  });
  assert.equal(resolved.kind === "path" ? resolved.commands.length : 0, 4);
});

test("an inset takes its sides and corner radii", () => {
  assert.deepEqual(
    resolveClipShape({
      shape: shapeOf("inset(10px 20px round 5px 10px / 2px)"),
      ...SIZE
    }), {
      kind: "rounded",
      x: 20,
      y: 10,
      width: 160,
      height: 80,
      radii: [
        {
          x: 5,
          y: 2
        },
        {
          x: 10,
          y: 2
        },
        {
          x: 5,
          y: 2
        },
        {
          x: 10,
          y: 2
        }
      ]
    }
  );
});

test("a geometry box after the shape is ignored", () => {
  assert.equal(shapeOf("circle(10px) border-box").kind, "circle");
});

test("what has no meaning says so", () => {
  assert.equal(parseClipPath("rect(0 10px 10px 0)").isValid, false);
  assert.equal(parseClipPath("url(#clip)").isValid, false);
  assert.equal(parseClipPath("circle(1px 2px)").isValid, false);
  assert.equal(parseClipPath("polygon(0 0, 1px)").isValid, false);
  assert.equal(parseClipPath("path(M0 0)").isValid, false);
  assert.equal(parseClipPath("blob").isValid, false);
});

test("a shape survives the JSON it travels as", () => {
  const shape = shapeOf("ellipse(30px 20% at right bottom)");
  assert.deepEqual(readClipShape(JSON.stringify(shape)), shape);
});
