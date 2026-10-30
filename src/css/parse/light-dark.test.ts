import { replaceLightDark } from "./light-dark.ts";
import assert from "node:assert/strict";
import { test } from "node:test";

test("each light-dark() becomes a var() and a pair", () => {
  let count = 0;
  const result = replaceLightDark({
    value: "1px solid light-dark(#fff, rgb(0 0 0)) light-dark(red, blue)",
    nameFor: () => `--ld-${count++}`
  });
  assert.equal(result.value, "1px solid var(--ld-0) var(--ld-1)");
  assert.deepEqual(result.pairs, [
    {
      name: "--ld-0",
      light: "#fff",
      dark: "rgb(0 0 0)"
    },
    {
      name: "--ld-1",
      light: "red",
      dark: "blue"
    }
  ]);
});

test("a value without light-dark(), or with a malformed one, is left as it is", () => {
  function names() {
    return "--x";
  }
  assert.deepEqual(
    replaceLightDark({
      value: "red",
      nameFor: names
    }), {
      value: "red",
      pairs: []
    }
  );
  assert.equal(
    replaceLightDark({
      value: "light-dark(red)",
      nameFor: names
    }).value, "light-dark(red)"
  );
});
