import { mediaMatches, parseMediaQuery } from "./media.ts";
import assert from "node:assert/strict";
import { test } from "node:test";

test("a width query is read into bounds in px", () => {
  assert.deepEqual(parseMediaQuery("(min-width: 600px)"), {
    minWidth: 600,
    maxWidth: null,
    minHeight: null,
    maxHeight: null
  });
  assert.deepEqual(parseMediaQuery("screen and (min-width: 640px) and (max-width: 900px)"), {
    minWidth: 640,
    maxWidth: 900,
    minHeight: null,
    maxHeight: null
  });
  assert.deepEqual(parseMediaQuery("(width >= 500px) and (height <= 300px)"), {
    minWidth: 500,
    maxWidth: null,
    minHeight: null,
    maxHeight: 300
  });
});

test("a length in em or rem is not a media condition: only px is native", () => {
  assert.equal(parseMediaQuery("(min-width: 40rem)"), null);
  assert.equal(parseMediaQuery("(max-width: 40em)"), null);
});

test("the tighter of two bounds on one side wins", () => {
  assert.equal(parseMediaQuery("(min-width: 300px) and (min-width: 500px)")?.minWidth, 500);
  assert.equal(parseMediaQuery("(max-width: 300px) and (max-width: 500px)")?.maxWidth, 300);
});

test("a query about anything else is null", () => {
  for (const query of ["(prefers-color-scheme: dark)", "(orientation: landscape)", "print", "(min-width: 50%)", "(min-width: 1px) or (max-width: 5px)"]) {
    assert.equal(parseMediaQuery(query), null, query);
  }
});

test("a viewport inside the bounds matches, an unknown one does not", () => {
  const media = parseMediaQuery("(min-width: 600px) and (max-width: 900px)");
  assert.ok(media);
  assert.equal(
    mediaMatches({
      media,
      viewport: {
        width: 600,
        height: 10
      }
    }), true
  );
  assert.equal(
    mediaMatches({
      media,
      viewport: {
        width: 901,
        height: 10
      }
    }), false
  );
  assert.equal(
    mediaMatches({
      media,
      viewport: {
        width: 599,
        height: 10
      }
    }), false
  );
  assert.equal(
    mediaMatches({
      media,
      viewport: null
    }), false
  );
});
