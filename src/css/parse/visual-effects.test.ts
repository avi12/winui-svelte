import {
  isNoEffect,
  maskShorthandImage,
  NO_EFFECTS,
  parseBlendMode,
  parseMaskImage,
  readVisualEffects,
  writeVisualEffects
} from "./visual-effects.ts";
import type { VisualEffects } from "./visual-effects.ts";
import assert from "node:assert/strict";
import { test } from "node:test";

test("a blend mode is normal (null) or a keyword", () => {
  assert.deepEqual(parseBlendMode("normal"), {
    isValid: true,
    mode: null
  });
  assert.deepEqual(parseBlendMode("Multiply"), {
    isValid: true,
    mode: "multiply"
  });
  assert.equal(parseBlendMode("plus-lighter").isValid, false);
});

test("a mask image is a gradient's alpha or a url", () => {
  const gradient = parseMaskImage("linear-gradient(to bottom, #000, transparent)");
  assert.ok(gradient.isValid);
  assert.equal(gradient.mask?.kind, "gradient");
  assert.deepEqual(parseMaskImage("url('mask.png')"), {
    isValid: true,
    mask: {
      kind: "image",
      url: "mask.png"
    },
    warnings: []
  });
  assert.deepEqual(parseMaskImage("none"), {
    isValid: true,
    mask: null,
    warnings: []
  });
  assert.equal(parseMaskImage("conic-gradient(red, blue)").isValid, false);
});

test("the mask shorthand's image is the first function in it", () => {
  assert.equal(maskShorthandImage("linear-gradient(black, transparent) center / cover no-repeat"), "linear-gradient(black, transparent)");
  assert.equal(maskShorthandImage("none"), "none");
});

test("effects survive the JSON they travel as, and an empty one is no effect", () => {
  const mask = parseMaskImage("radial-gradient(circle, #000, transparent)");
  assert.ok(mask.isValid);
  const effects: VisualEffects = {
    filter: [{
      kind: "blur",
      radius: 3
    }],
    backdrop: [],
    blend: "screen",
    mask: mask.mask
  };
  assert.deepEqual(readVisualEffects(writeVisualEffects(effects)), effects);
  assert.equal(isNoEffect(effects), false);
  assert.equal(isNoEffect(NO_EFFECTS), true);
});
