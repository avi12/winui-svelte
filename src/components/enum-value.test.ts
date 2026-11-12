import { enumValue } from "./convert.ts";
import assert from "node:assert/strict";
import { test } from "node:test";

// WinUI names its members in UpperCamelCase
const Modifiers = {
  None: 0,
  Control: 1,
  Menu: 2,
  Shift: 4,
  High: 2147483648
} as const;

test("an enum prop takes a member by its WinUI name or its value", () => {
  assert.equal(
    enumValue({
      table: Modifiers,
      input: "Shift"
    }), Modifiers.Shift
  );
  assert.equal(
    enumValue({
      table: Modifiers,
      input: Modifiers.Menu
    }), Modifiers.Menu
  );
});

test("a flag enum prop combines a list of names", () => {
  assert.equal(
    enumValue({
      table: Modifiers,
      input: ["Control", "Shift"]
    }), Modifiers.Control | Modifiers.Shift
  );
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

test("the error names the prop and the members it takes", () => {
  assert.throws(() => enumValue({
    table: Modifiers,
    // @ts-expect-error the value is out of the set on purpose
    input: "wrap",
    prop: "textWrapping"
  }), {
    name: "RangeError",
    message: "textWrapping: \"wrap\" is not one of None, Control, Menu, Shift, High"
  });
});

test("a member with the top bit set stays unsigned", () => {
  assert.equal(
    enumValue({
      table: Modifiers,
      input: "High"
    }), Modifiers.High
  );
});
