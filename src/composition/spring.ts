import { ExpressionKind } from "./expression.ts";
import type { ExpressionOfKind, ValueOfKind } from "./expression.ts";

// Spring animations as plain descriptions: what Compositor.CreateSpring*Animation
// is given, kept apart from WinUI so the shapes are typed and tested without it.

/** How a spring moves its property to `finalValue`. */
export interface SpringOptions<Value> {
  /** Where the spring comes to rest. */
  readonly finalValue: Value;
  /** Where it starts; the property's current value when left out. */
  readonly initialValue?: Value;
  /** How fast it starts, in units per second. */
  readonly initialVelocity?: Value;
  /**
   * How much the spring is damped: below 1 it overshoots and oscillates, 1
   * settles without overshoot. Composition's default when left out.
   */
  readonly dampingRatio?: number;
  /** How long one oscillation takes, in milliseconds. Composition's default when left out. */
  readonly period?: number;
  /** How long to wait before it starts, in milliseconds. */
  readonly delay?: number;
}

/** A spring animation of one kind of value; of any kind, it is the union of the three. */
export type Spring<Kind extends ExpressionKind> = Kind extends ExpressionKind ? {
  readonly kind: Kind;
  readonly spring: SpringOptions<ValueOfKind[Kind]>;
} : never;

/** What animates a property of a kind on the compositor: an expression it follows, or a spring. */
export type CompositionAnimationOf<Kind extends ExpressionKind> = ExpressionOfKind[Kind] | Spring<Kind>;

/** A spring for a scalar property: an opacity, an angle, one component of an offset. */
export function scalarSpring(options: SpringOptions<number>) {
  return {
    kind: ExpressionKind.SCALAR,
    spring: options
  } satisfies Spring<typeof ExpressionKind.SCALAR>;
}

/** A spring for a two-component property: a size, an anchor point. */
export function vector2Spring(options: SpringOptions<ValueOfKind["vector2"]>) {
  return {
    kind: ExpressionKind.VECTOR2,
    spring: options
  } satisfies Spring<typeof ExpressionKind.VECTOR2>;
}

/** A spring for a three-component property: an offset, a scale, a translation. */
export function vector3Spring(options: SpringOptions<ValueOfKind["vector3"]>) {
  return {
    kind: ExpressionKind.VECTOR3,
    spring: options
  } satisfies Spring<typeof ExpressionKind.VECTOR3>;
}
