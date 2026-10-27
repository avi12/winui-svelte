import { movedIndex, MoveDirection, sameOrder } from "./reorder.ts";
import assert from "node:assert/strict";
import { test } from "node:test";

const order = ["a", "b", "c"];

test("a key moves one place up or down", () => {
  assert.equal(
    movedIndex({
      order,
      key: "b",
      direction: MoveDirection.UP
    }), 0
  );
  assert.equal(
    movedIndex({
      order,
      key: "b",
      direction: MoveDirection.DOWN
    }), 2
  );
});

test("a key at an end cannot move past it, and an unknown key does not move", () => {
  assert.equal(
    movedIndex({
      order,
      key: "a",
      direction: MoveDirection.UP
    }), null
  );
  assert.equal(
    movedIndex({
      order,
      key: "c",
      direction: MoveDirection.DOWN
    }), null
  );
  assert.equal(
    movedIndex({
      order,
      key: "x",
      direction: MoveDirection.DOWN
    }), null
  );
});

test("two orders are the same when they list the same keys in the same places", () => {
  assert.ok(
    sameOrder({
      first: order,
      second: ["a", "b", "c"]
    })
  );
  assert.ok(
    !sameOrder({
      first: order,
      second: ["a", "c", "b"]
    })
  );
  assert.ok(
    !sameOrder({
      first: order,
      second: ["a", "b"]
    })
  );
});
