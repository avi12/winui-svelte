import type { AnimationOptions } from "./animate.ts";
import {
  compositionPath,
  ExpressionKind,
  rawExpression,
  reference,
  scalar,
  vector3
} from "./expression.ts";
import { scalarSpring, vector3Spring } from "./spring.ts";
import { kindOfValue, kindsOfValues, VISUAL_MEMBERS } from "./targets.ts";
import type { KindsOfValues, VisualMembers } from "./targets.ts";
import type { CompositionObject } from "#winui/microsoft/ui/composition/CompositionObject";
import assert from "node:assert/strict";
import { test } from "node:test";

function standIn() {
  const visual = {};
  return visual as unknown as CompositionObject;
}

const LEADER = standIn();
const OTHER = standIn();

function leader() {
  return reference({
    name: "leader",
    members: VISUAL_MEMBERS,
    source: LEADER
  });
}

test("a member and its components spell the Composition names", () => {
  const visual = leader();
  assert.equal(visual.offset.text, "leader.Offset");
  assert.equal(visual.offset.y.text, "leader.Offset.Y");
  assert.equal(visual.rotationAngleInDegrees.text, "leader.RotationAngleInDegrees");
  assert.equal(compositionPath("offset.x"), "Offset.X");
});

test("arithmetic prints the fewest parentheses that keep its meaning", () => {
  const { offset, opacity } = leader();
  assert.equal(
    offset.plus({
      x: 0,
      y: 40,
      z: 0
    }).text, "leader.Offset + Vector3(0, 40, 0)"
  );
  assert.equal(offset.x.plus(1).times(2).text, "(leader.Offset.X + 1) * 2");
  assert.equal(offset.x.times(2).plus(1).text, "leader.Offset.X * 2 + 1");
  assert.equal(opacity.minus(scalar(1).minus(opacity)).text, "leader.Opacity - (1 - leader.Opacity)");
  assert.equal(opacity.dividedBy(opacity.dividedBy(2)).text, "leader.Opacity / (leader.Opacity / 2)");
  assert.equal(opacity.minus(-0.5).text, "leader.Opacity - (-0.5)");
  assert.equal(offset.x.negated().negated().text, "-(-leader.Offset.X)");
  assert.equal(offset.times(0.5).negated().text, "-(leader.Offset * 0.5)");
});

test("functions take their operands in order", () => {
  const { offset, opacity } = leader();
  assert.equal(
    opacity.clamped({
      min: 0,
      max: 1
    }).text, "Clamp(leader.Opacity, 0, 1)"
  );
  assert.equal(
    offset.lerp({
      to: vector3({
        x: 1,
        y: 2,
        z: 3
      }),
      amount: opacity
    }).text, "Lerp(leader.Offset, Vector3(1, 2, 3), leader.Opacity)"
  );
  assert.equal(scalar(1 / 3).text, "0.333333");
});

test("an expression carries the objects it reads, by the names it gives them", () => {
  const follower = leader().offset.plus(
    reference({
      name: "other",
      members: VISUAL_MEMBERS,
      source: OTHER
    }).offset
  );
  assert.deepEqual([...follower.references], [["leader", LEADER], ["other", OTHER]]);
  const unbound = reference({
    name: "link",
    members: {
      progress: ExpressionKind.SCALAR
    }
  });
  assert.equal(unbound.progress.references.size, 0);
});

test("two objects under one name in an expression are refused", () => {
  const clash = reference({
    name: "leader",
    members: VISUAL_MEMBERS,
    source: OTHER
  });
  assert.throws(() => leader().offset.plus(clash.offset), /two objects are named leader/u);
});

test("raw text is an operand in parentheses, with its references", () => {
  const raw = rawExpression({
    kind: ExpressionKind.SCALAR,
    text: "Sin(leader.Opacity) + 1",
    references: new Map([["leader", LEADER]])
  });
  assert.equal(raw.times(2).text, "(Sin(leader.Opacity) + 1) * 2");
  assert.equal(raw.references.get("leader"), LEADER);
});

test("a property set's member kinds come from its first values", () => {
  assert.equal(kindOfValue(1), ExpressionKind.SCALAR);
  assert.deepEqual(
    kindsOfValues({
      progress: 0,
      pointer: {
        x: 0,
        y: 0
      },
      target: {
        x: 0,
        y: 0,
        z: 0
      }
    }), {
      progress: ExpressionKind.SCALAR,
      pointer: ExpressionKind.VECTOR2,
      target: ExpressionKind.VECTOR3
    }
  );
});

test("a wrong member or a value of the wrong kind fails to compile", () => {
  const visual = leader();
  // @ts-expect-error -- a visual has no ofset member
  assert.equal(visual.ofset, undefined);
  // @ts-expect-error -- a scalar has no components
  assert.equal(visual.opacity.x, undefined);
  const vectorIntoScalar: AnimationOptions<VisualMembers, "opacity"> = {
    property: "opacity",
    // @ts-expect-error -- opacity is a scalar, an offset a vector
    animation: visual.offset
  };
  const springIntoComponent: AnimationOptions<VisualMembers, "offset.x"> = {
    property: "offset.x",
    // @ts-expect-error -- one component of the offset is a scalar
    animation: vector3Spring({
      finalValue: {
        x: 0,
        y: 0,
        z: 0
      }
    })
  };
  const unknownProperty: AnimationOptions<VisualMembers, "offset.x"> = {
    // @ts-expect-error -- the property is named offset.x, not offset.w
    property: "offset.w",
    animation: scalarSpring({
      finalValue: 1
    })
  };
  const setMember: AnimationOptions<KindsOfValues<{ readonly progress: number }>, "progress"> = {
    property: "progress",
    animation: visual.offset.x.plus(1)
  };
  assert.deepEqual([vectorIntoScalar.property, springIntoComponent.property, unknownProperty.animation.kind, setMember.property], ["opacity", "offset.x", ExpressionKind.SCALAR, "progress"]);
  // @ts-expect-error -- a vector operand cannot be added to a scalar
  assert.ok(visual.opacity.plus(visual.offset));
});
