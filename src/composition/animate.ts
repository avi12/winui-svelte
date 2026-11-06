import { compositionPath, ExpressionKind, reference } from "./expression.ts";
import type { Expression, ReferenceMembers } from "./expression.ts";
import type { CompositionAnimationOf, Spring, SpringOptions } from "./spring.ts";
import { VISUAL_MEMBERS } from "./targets.ts";
import type { AnimatableProperties, PropertyName, VisualMembers } from "./targets.ts";
import { timeSpanTicks } from "#src/components/values.js";
import type { TimeSpanValue } from "#src/components/values.js";
import { control } from "#src/renderer/host/control.js";
import { CompositionBatchTypes } from "#winui/microsoft/ui/composition/CompositionBatchTypes";
import { CompositionGetValueStatus } from "#winui/microsoft/ui/composition/CompositionGetValueStatus";
import type { CompositionObject } from "#winui/microsoft/ui/composition/CompositionObject";
import type { Compositor } from "#winui/microsoft/ui/composition/Compositor";
import { ElementCompositionPreview } from "#winui/microsoft/ui/xaml/hosting/ElementCompositionPreview";
import type { UIElement } from "#winui/microsoft/ui/xaml/UIElement";

// Runs typed animations on the compositor: an expression becomes an
// ExpressionAnimation with its references bound, a spring a
// Spring*NaturalMotionAnimation, and either is started on the property it
// targets. The compositor runs them on its own thread, so the UI thread stays
// idle while they move.

/** An animation the compositor runs. */
export interface RunningAnimation {
  /** Stops it; the property keeps the value it had reached. */
  stop(): void;
  /** Settles when it ends: when a spring comes to rest, or when it is stopped (an expression runs until then). */
  readonly finished: Promise<void>;
}

const TRANSLATION = "Translation";
const ZERO = {
  x: 0,
  y: 0,
  z: 0
};

let referenceCount = 0;

// The members of Spring*NaturalMotionAnimation a spring sets, whatever its kind.
interface NativeSpring<Value> extends CompositionObject {
  dampingRatio: number;
  period: TimeSpanValue;
  finalValue: Value | null;
  initialValue: Value | null;
  initialVelocity: Value;
  delayTime: TimeSpanValue;
}

function timeSpanOf(milliseconds: number) {
  return {
    duration: timeSpanTicks(milliseconds)
  };
}

function configured<Value, Native extends NativeSpring<Value>>({ native, options }: {
  native: Native;
  options: SpringOptions<Value>;
}) {
  const { finalValue, initialValue, initialVelocity, dampingRatio, period, delay } = options;
  native.finalValue = finalValue;
  const hasInitialValue = initialValue !== undefined;
  if (hasInitialValue) {
    native.initialValue = initialValue;
  }

  const hasInitialVelocity = initialVelocity !== undefined;
  if (hasInitialVelocity) {
    native.initialVelocity = initialVelocity;
  }

  const hasDampingRatio = dampingRatio !== undefined;
  if (hasDampingRatio) {
    native.dampingRatio = dampingRatio;
  }

  const hasPeriod = period !== undefined;
  if (hasPeriod) {
    native.period = timeSpanOf(period);
  }

  const hasDelay = delay !== undefined;
  if (hasDelay) {
    native.delayTime = timeSpanOf(delay);
  }

  return native;
}

function springAnimation({ compositor, spring }: {
  compositor: Compositor;
  spring: Spring<ExpressionKind>;
}) {
  const isScalar = spring.kind === ExpressionKind.SCALAR;
  if (isScalar) {
    return configured({
      native: compositor.createSpringScalarAnimation(),
      options: spring.spring
    });
  }

  const isVector2 = spring.kind === ExpressionKind.VECTOR2;
  if (isVector2) {
    return configured({
      native: compositor.createSpringVector2Animation(),
      options: spring.spring
    });
  }

  return configured({
    native: compositor.createSpringVector3Animation(),
    options: spring.spring
  });
}

function expressionAnimation({ compositor, expression }: {
  compositor: Compositor;
  expression: Expression;
}) {
  const native = compositor.createExpressionAnimation(expression.text);
  for (const [name, source] of expression.references) {
    native.setReferenceParameter(name, source);
  }

  return native;
}

/** A unique name for a reference that is not given one. */
export function nextReferenceName() {
  referenceCount += 1;
  return `reference${referenceCount}`;
}

/**
 * Starts an animation on a property of a Composition object, the `offset.x`
 * of a visual or a member of a property set, spelled in camel case.
 *
 * @returns The running animation.
 */
export function startAnimation({ target, property, animation }: {
  target: CompositionObject;
  property: string;
  animation: CompositionAnimationOf<ExpressionKind>;
}) {
  const { compositor } = target;
  const path = compositionPath(property);
  const isSpring = "spring" in animation;
  if (!isSpring) {
    const native = expressionAnimation({
      compositor,
      expression: animation
    });
    target.startAnimation(path, native);
    const { promise, resolve } = Promise.withResolvers<void>();
    return {
      stop() {
        target.stopAnimation(path);
        native.close();
        resolve();
      },
      finished: promise
    } satisfies RunningAnimation;
  }

  const native = springAnimation({
    compositor,
    spring: animation
  });
  const batch = compositor.createScopedBatch(CompositionBatchTypes.Animation);
  target.startAnimation(path, native);
  batch.end();
  const { promise, resolve } = Promise.withResolvers<void>();
  batch.onceCompleted(() => resolve());
  return {
    stop() {
      target.stopAnimation(path);
      resolve();
    },
    finished: promise.finally(() => {
      native.close();
      batch.close();
    })
  } satisfies RunningAnimation;
}

/**
 * Gives an element's visual the `Translation` property that expressions read
 * and animations target, keeping the value it has when it has one already.
 */
function enableTranslation(element: UIElement) {
  const visual = ElementCompositionPreview.getElementVisual(element);
  const [, status] = visual.properties.tryGetVector3(TRANSLATION);
  const hasTranslation = status === CompositionGetValueStatus.Succeeded;
  if (hasTranslation) {
    return visual;
  }

  ElementCompositionPreview.setIsTranslationEnabled(element, true);
  visual.properties.insertVector3(TRANSLATION, ZERO);
  return visual;
}

/**
 * An element's visual for expressions to read, with typed members:
 * `visualReference(card).offset.y.plus(40)`. A member the visual does not
 * have fails to compile.
 *
 * @param element - The element whose visual is read, a control from `control` or `elementRef`.
 * @returns The reference, bound to the visual wherever an expression uses it.
 */
export function visualReference(element: UIElement) {
  return reference({
    name: nextReferenceName(),
    members: VISUAL_MEMBERS,
    source: enableTranslation(element)
  });
}

/** What animates one property of an object with these members: the property and an animation of its kind. */
export interface AnimationOptions<Members extends ReferenceMembers, Property extends PropertyName<Members>> {
  /** The property, in camel case: `offset`, `offset.x`, `opacity`. */
  readonly property: Property;
  /** An expression the property follows, or a spring that moves it. */
  readonly animation: CompositionAnimationOf<Extract<AnimatableProperties<Members>[Property], ExpressionKind>>;
}

/**
 * Animates a property of an element's visual on the compositor: an
 * expression it follows from then on, or a spring that moves it to rest. The
 * animation's kind must match the property's (a vector for `offset`, a scalar
 * for `offset.x` or `opacity`), or it fails to compile.
 *
 * @returns The running animation.
 */
export function animateOnCompositor<Property extends PropertyName<VisualMembers>>({ element, property, animation }:
  AnimationOptions<VisualMembers, Property> & {
    /** The element whose visual is animated. */
    readonly element: UIElement;
  }) {
  return startAnimation({
    target: enableTranslation(element),
    property,
    animation
  });
}

/**
 * `animateOnCompositor` as an attachment: `compositorAnimation({ property:
 * "offset", animation })` after `@attach` on the element. It stops when the
 * element goes or the expression is evaluated again.
 *
 * @returns The attachment to put after `@attach`.
 */
export function compositorAnimation<Property extends PropertyName<VisualMembers>>(
  options: AnimationOptions<VisualMembers, Property>
) {
  return control<UIElement>(element => {
    const running = animateOnCompositor({
      ...options,
      element
    });
    return () => running.stop();
  });
}
