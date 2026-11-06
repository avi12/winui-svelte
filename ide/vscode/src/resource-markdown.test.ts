import { resourceMarkdown } from "./preview.ts";
import assert from "node:assert/strict";
import { test } from "node:test";

test("a color resource shows its light and dark swatch with both values", () => {
  const markdown = resourceMarkdown({
    name: "CardBackgroundFillColorDefault",
    kind: "Color",
    light: "#ffffffb3",
    dark: "#ffffff0d"
  });
  const [, encoded] = /base64,([^)]+)\)/u.exec(markdown) ?? [];
  const svg = Buffer.from(encoded ?? "", "base64").toString();
  assert.match(svg, /fill="#ffffffb3"/u);
  assert.match(svg, /fill="#ffffff0d"/u);
  assert.match(markdown, /light `#ffffffb3` · dark `#ffffff0d`/u);
  assert.match(markdown, /\*\*CardBackgroundFillColorDefault\*\* Color/u);
});

test("a color that follows the system says so for the theme without a value", () => {
  const markdown = resourceMarkdown({
    name: "Clear",
    kind: "Brush",
    light: "transparent"
  });
  assert.match(markdown, /dark `follows the system`/u);
});

test("a resource that is no color is only named", () => {
  assert.equal(
    resourceMarkdown({
      name: "ControlCornerRadius",
      kind: "CornerRadius"
    }), "**ControlCornerRadius** CornerRadius"
  );
});
