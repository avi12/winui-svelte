// The opt-in Composition animation part of the package: `winui-svelte/composition`.
// Typed expressions, springs and property sets that the compositor runs on its
// own thread; nothing of it is loaded by an app that does not import it.

export { animateOnCompositor, compositorAnimation, visualReference } from "./animate.ts";
export type { AnimationOptions, RunningAnimation } from "./animate.ts";
export {
  ExpressionKind,
  rawExpression,
  reference,
  scalar,
  ScalarExpression,
  vector2,
  Vector2Expression,
  Vector2Member,
  vector3,
  Vector3Expression,
  Vector3Member
} from "./expression.ts";
export type {
  Expression,
  ExpressionReferences,
  Reference,
  ReferenceMembers,
  ScalarOperand,
  Vector2Operand,
  Vector2Value,
  Vector3Operand,
  Vector3Value
} from "./expression.ts";
export { createPropertySet } from "./property-set.ts";
export type { PropertySet } from "./property-set.ts";
export { scalarSpring, vector2Spring, vector3Spring } from "./spring.ts";
export type { CompositionAnimationOf, Spring, SpringOptions } from "./spring.ts";
export { VISUAL_MEMBERS } from "./targets.ts";
export type { AnimatableProperties, MemberValue, VisualMembers } from "./targets.ts";
