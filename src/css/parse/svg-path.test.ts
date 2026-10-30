import { parsePathData } from "./svg-path.ts";
import assert from "node:assert/strict";
import { test } from "node:test";

function commandsOf(text: string) {
  const result = parsePathData(text);
  assert.ok(result.isValid, text);
  return result.commands;
}

test("moves, lines and closes", () => {
  assert.deepEqual(commandsOf("M 1 2 L 3 4 Z"), [
    {
      kind: "move",
      x: 1,
      y: 2
    },
    {
      kind: "line",
      x: 3,
      y: 4
    },
    { kind: "close" }
  ]);
});

test("relative commands are made absolute, and H and V are lines", () => {
  assert.deepEqual(commandsOf("m 10 10 l 5 5 h 5 v -5 H 0 V 0"), [
    {
      kind: "move",
      x: 10,
      y: 10
    },
    {
      kind: "line",
      x: 15,
      y: 15
    },
    {
      kind: "line",
      x: 20,
      y: 15
    },
    {
      kind: "line",
      x: 20,
      y: 10
    },
    {
      kind: "line",
      x: 0,
      y: 10
    },
    {
      kind: "line",
      x: 0,
      y: 0
    }
  ]);
});

test("a number list after M is lines, and a repeated command drops its letter", () => {
  const commands = commandsOf("M0,0 10,0 10,10");
  assert.deepEqual(commands.map(command => command.kind), ["move", "line", "line"]);
});

test("cubic, smooth cubic and quadratic keep their control points", () => {
  const [, cubic, smooth, quadratic, smoothQuadratic] = commandsOf("M0 0 C 1 2 3 4 5 6 S 9 8 10 10 Q 12 12 14 14 T 20 20");
  assert.deepEqual(cubic, {
    kind: "cubic",
    x1: 1,
    y1: 2,
    x2: 3,
    y2: 4,
    x: 5,
    y: 6
  });
  assert.deepEqual(smooth, {
    kind: "cubic",
    x1: 7,
    y1: 8,
    x2: 9,
    y2: 8,
    x: 10,
    y: 10
  });
  assert.equal(quadratic?.kind, "quadratic");
  assert.deepEqual(smoothQuadratic, {
    kind: "quadratic",
    x1: 16,
    y1: 16,
    x: 20,
    y: 20
  });
});

test("an arc reads its flags even when they touch the next number", () => {
  const [, arc] = commandsOf("M0 0 a5 5 0 1110 10");
  assert.deepEqual(arc, {
    kind: "arc",
    radiusX: 5,
    radiusY: 5,
    rotation: 0,
    isLarge: true,
    isSweep: true,
    x: 10,
    y: 10
  });
});

test("data that is not path data says why", () => {
  assert.deepEqual(parsePathData("L 1 2"), {
    isValid: false,
    reason: "path data starts with a move (M)"
  });
  assert.equal(parsePathData("M 1").isValid, false);
  assert.equal(parsePathData("").isValid, false);
  assert.equal(parsePathData("M 0 0 X").isValid, false);
});
