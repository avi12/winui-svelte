import { enumValue } from "./convert.ts";
import assert from "node:assert/strict";
import { test } from "node:test";

const Modifiers = {
  None: 0,
  Control: 1,
  Menu: 2,
  Shift: 4
} as const;

test("an enum prop takes a member by its WinUI name or its value", () => {
  assert.equal(enumValue({
    table: Modifiers,
    input: "Shift"
  }), Modifiers.Shift);
  assert.equal(enumValue({
    table: Modifiers,
    input: Modifiers.Menu
  }), Modifiers.Menu);
});

test("a flag enum prop combines a list of names", () => {
  assert.equal(enumValue({
    table: Modifiers,
    input: ["Control", "Shift"]
  }), Modifiers.Control | Modifiers.Shift);
});

test("an enum prop refuses what is no member", () => {
  const refused: unknown[] = ["shift", 3, ["Control", "Alt"]];
  for (const input of refused) {
    assert.throws(() => enumValue({
      table: Modifiers,
      // @ts-expect-error the values are out of the set on purpose
      input
    }), RangeError);
  }
});
