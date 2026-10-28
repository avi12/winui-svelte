import { boxed, unboxed } from "./values.ts";
import { roInitialize } from "@microsoft/dynwinrt";
import assert from "node:assert/strict";
import { test } from "node:test";

// The plain values `boxed` makes and `unboxed` reads back, through WinRT's own
// PropertyValue (no window needed, only the runtime).

roInitialize();

const INT32_LIMIT = 2 ** 31;
const FRACTION = 1.5;

test("a string, a boolean and a number come back as they went in", () => {
  assert.equal(unboxed(boxed("Wi-Fi")), "Wi-Fi");
  assert.equal(unboxed(boxed(true)), true);
  assert.equal(unboxed(boxed(false)), false);
  assert.equal(unboxed(boxed(42)), 42);
  assert.equal(unboxed(boxed(-7)), -7);
});

test("a fraction, and a whole number too big for an Int32, are boxed as a Double", () => {
  assert.equal(unboxed(boxed(FRACTION)), FRACTION);
  assert.equal(unboxed(boxed(INT32_LIMIT)), INT32_LIMIT);
});

test("nothing unboxes to null", () => {
  assert.equal(unboxed(null), null);
  assert.equal(unboxed(undefined), null);
});
