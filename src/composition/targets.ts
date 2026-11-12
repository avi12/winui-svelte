import { ExpressionKind } from "./expression.ts";
import type { ReferenceMembers, Vector2Value, Vector3Value } from "./expression.ts";

// What an animation can target and what an expression can read: the members
// of an element's Composition visual, and the kind of a property set's member
// from the value it starts with. One table types both the references and the
// animated properties.

/**
 * The animatable members of an element's visual, by the camel-case name a
 * reference and `animateOnCompositor` give them.
 */
export const VISUAL_MEMBERS = {
  anchorPoint: ExpressionKind.VECTOR2,
  centerPoint: ExpressionKind.VECTOR3,
  offset: ExpressionKind.VECTOR3,
  opacity: ExpressionKind.SCALAR,
  rotationAngleInDegrees: ExpressionKind.SCALAR,
  scale: ExpressionKind.VECTOR3,
  size: ExpressionKind.VECTOR2,
  translation: ExpressionKind.VECTOR3
} as const;

/** The members of an element's visual and their kinds. */
export type VisualMembers = typeof VISUAL_MEMBERS;

interface ComponentsOfKind {
  readonly scalar: never;
  readonly vector2: "x" | "y";
  readonly vector3: "x" | "y" | "z";
}

/**
 * The properties an animation can target on an object with these members: each
 * member, and each component of a vector member (`offset.x`), a scalar.
 */
export type AnimatableProperties<Members extends ReferenceMembers> = {
  readonly [Name in keyof Members & string]: Members[Name];
} & {
  readonly [Name in keyof Members & string as `${Name}.${ComponentsOfKind[Members[Name]]}`]: typeof ExpressionKind.SCALAR;
};

/** A property an animation can target on an object with these members, in camel case. */
export type PropertyName<Members extends ReferenceMembers> = keyof AnimatableProperties<Members> & string;

/** A value a property set member holds: a number, a `{ x, y }` or a `{ x, y, z }`. */
export type MemberValue = number | Vector2Value | Vector3Value;

/** The kind of a member from its value. */
export type KindOfValue<Value extends MemberValue> = Value extends number
  ? typeof ExpressionKind.SCALAR
  : Value extends Vector3Value ? typeof ExpressionKind.VECTOR3 : typeof ExpressionKind.VECTOR2;

/** The kinds of the members of a property set, from the values it starts with. */
export type KindsOfValues<Values extends Readonly<Record<string, MemberValue>>> = {
  readonly [Name in keyof Values]: KindOfValue<Values[Name]>;
};

/** The kind of a member value, read from its shape. */
export function kindOfValue(value: MemberValue) {
  const isScalar = typeof value === "number";
  if (isScalar) {
    return ExpressionKind.SCALAR;
  }

  return "z" in value ? ExpressionKind.VECTOR3 : ExpressionKind.VECTOR2;
}

/** The kinds of a property set's members, from the values it starts with. */
export function kindsOfValues<Values extends Readonly<Record<string, MemberValue>>>(values: Values) {
  const entries = Object.entries(values).map(([name, value]) => [name, kindOfValue(value)]);
  return Object.fromEntries(entries) as KindsOfValues<Values>;
}
