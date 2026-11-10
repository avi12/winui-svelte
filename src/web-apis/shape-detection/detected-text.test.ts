import { detectedTextOf } from "./detected-text.ts";
import { DOMRectReadOnly } from "./dom-rect-read-only.ts";
import assert from "node:assert/strict";
import { test } from "node:test";

test("a line becomes a DetectedText with a rectangle, clockwise corners and its words", () => {
  const detected = detectedTextOf({
    text: "hello world",
    bounds: {
      x: 10,
      y: 20,
      width: 100,
      height: 30
    },
    words: [
      {
        text: "hello",
        bounds: {
          x: 10,
          y: 20,
          width: 40,
          height: 30
        }
      },
      {
        text: "world",
        bounds: {
          x: 70,
          y: 22,
          width: 40,
          height: 26
        }
      }
    ]
  });
  assert.equal(detected.rawValue, "hello world");
  assert.ok(detected.boundingBox instanceof DOMRectReadOnly);
  assert.deepEqual(
    [detected.boundingBox.x, detected.boundingBox.y, detected.boundingBox.right, detected.boundingBox.bottom],
    [10, 20, 110, 50]
  );
  assert.deepEqual(detected.cornerPoints, [
    {
      x: 10,
      y: 20
    },
    {
      x: 110,
      y: 20
    },
    {
      x: 110,
      y: 50
    },
    {
      x: 10,
      y: 50
    }
  ]);
  assert.deepEqual(detected.words.map(word => word.rawValue), ["hello", "world"]);
  assert.equal(detected.words[1]?.boundingBox.left, 70);
  assert.equal(detected.words[1]?.cornerPoints.length, 4);
});

test("DOMRectReadOnly keeps its edges when the size is negative and writes them to JSON", () => {
  const rectangle = new DOMRectReadOnly(10, 10, -4, -6);
  assert.deepEqual([rectangle.left, rectangle.right, rectangle.top, rectangle.bottom], [6, 10, 4, 10]);
  assert.deepEqual(DOMRectReadOnly.fromRect({ width: 3 }).toJSON(), {
    x: 0,
    y: 0,
    width: 3,
    height: 0,
    top: 0,
    right: 3,
    bottom: 0,
    left: 0
  });
});
