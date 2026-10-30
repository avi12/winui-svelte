import { FormValues } from "./form-values.ts";
import assert from "node:assert/strict";
import { test } from "node:test";

// The FormData-like collection.

test("get, getAll, has, append, set and delete work as FormData's do", () => {
  const values = new FormValues([["a", "1"], ["b", 2]]);
  values.append({
    name: "a",
    value: "3"
  });
  assert.equal(values.get("a"), "1");
  assert.deepEqual(values.getAll("a"), ["1", "3"]);
  assert.equal(values.get("missing"), null);
  assert.equal(values.has("b"), true);
  values.set({
    name: "a",
    value: "only"
  });
  assert.deepEqual(values.getAll("a"), ["only"]);
  assert.deepEqual([...values.keys()], ["a", "b"]);
  values.delete("a");
  assert.equal(values.has("a"), false);
  assert.equal(values.size, 1);
});

test("it iterates as entries, so Object.fromEntries and Map read it", () => {
  const values = new FormValues([["name", "Ada"], ["age", 36], ["ok", true]]);
  assert.deepEqual(Object.fromEntries(values), {
    name: "Ada",
    age: 36,
    ok: true
  });
  assert.equal(new Map(values).get("age"), 36);
});

test("toObject gives an array for a repeated name", () => {
  const values = new FormValues([["tag", "a"], ["tag", "b"], ["one", "x"]]);
  assert.deepEqual(values.toObject(), {
    tag: ["a", "b"],
    one: "x"
  });
});

test("toFormData writes every value as text", () => {
  const date = new Date("2026-01-02T03:04:05.000Z");
  const formData = new FormValues([["n", 7], ["d", date], ["x", null], ["b", false]]).toFormData();
  assert.equal(formData.get("n"), "7");
  assert.equal(formData.get("d"), date.toISOString());
  assert.equal(formData.get("x"), "");
  assert.equal(formData.get("b"), "false");
});
