import { captionButtonChanges, scaledRegion } from "./chrome.ts";
import type { CaptionButtonProperty } from "./chrome.ts";
import assert from "node:assert/strict";
import { test } from "node:test";

const NOTHING_APPLIED: ReadonlySet<CaptionButtonProperty> = new Set();
const SCALE_150_PERCENT = 1.5;

test("a caption button color is written to its title bar property", () => {
  const changes = captionButtonChanges({
    colors: {
      foreground: "#fff",
      hoverBackground: "#80112233"
    },
    applied: NOTHING_APPLIED
  });
  assert.deepEqual(changes, [
    {
      property: "buttonForegroundColor",
      color: {
        a: 255,
        r: 255,
        g: 255,
        b: 255
      }
    },
    {
      property: "buttonHoverBackgroundColor",
      color: {
        a: 128,
        r: 17,
        g: 34,
        b: 51
      }
    }
  ]);
});

test("a color left out is not written unless the app had set it", () => {
  assert.deepEqual(
    captionButtonChanges({
      colors: undefined,
      applied: NOTHING_APPLIED
    }), []
  );
  assert.deepEqual(
    captionButtonChanges({
      colors: {
        foreground: "transparent"
      },
      applied: new Set<CaptionButtonProperty>(["buttonForegroundColor", "buttonPressedBackgroundColor"])
    }), [
      {
        property: "buttonForegroundColor",
        color: {
          a: 0,
          r: 0,
          g: 0,
          b: 0
        }
      },
      {
        property: "buttonPressedBackgroundColor",
        color: null
      }
    ]
  );
});

test("text that is not a color is refused with the same error as a color prop", () => {
  assert.throws(() => captionButtonChanges({
    colors: {
      // @ts-expect-error the type refuses it too; the runtime check is what is tested
      background: "not-a-color"
    },
    applied: NOTHING_APPLIED
  }), TypeError);
});

test("a region is scaled to device pixels and rounded", () => {
  assert.deepEqual(
    scaledRegion({
      region: {
        x: 1,
        y: 3,
        width: 101,
        height: 31
      },
      scale: SCALE_150_PERCENT
    }), {
      x: 2,
      y: 5,
      width: 152,
      height: 47
    }
  );
});
