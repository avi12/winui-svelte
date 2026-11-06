import { nextReferenceName, startAnimation } from "./animate.ts";
import type { AnimationOptions } from "./animate.ts";
import { compositionPath, reference } from "./expression.ts";
import type { Vector2Value, Vector3Value } from "./expression.ts";
import { kindsOfValues } from "./targets.ts";
import type { KindsOfValues, MemberValue, PropertyName } from "./targets.ts";
import type { CompositionPropertySet } from "#winui/microsoft/ui/composition/CompositionPropertySet";
import { ElementCompositionPreview } from "#winui/microsoft/ui/xaml/hosting/ElementCompositionPreview";
import type { UIElement } from "#winui/microsoft/ui/xaml/UIElement";

// A CompositionPropertySet with declared members: values the app writes from
// the UI thread (a pointer position, a progress) that expressions on the
// compositor read, and that animations can drive in turn.

function isVector3(value: Vector2Value | Vector3Value): value is Vector3Value {
  return "z" in value;
}

function insert({ native, name, value }: {
  native: CompositionPropertySet;
  name: string;
  value: MemberValue;
}) {
  const path = compositionPath(name);
  const isScalar = typeof value === "number";
  if (isScalar) {
    native.insertScalar(path, value);
    return;
  }

  if (isVector3(value)) {
    native.insertVector3(path, value);
    return;
  }

  native.insertVector2(path, value);
}

/**
 * A property set with the members `values` declares, each starting at its
 * value there: a number is a scalar member, `{ x, y }` and `{ x, y, z }` vector
 * members. `reference` reads them in expressions (`set.reference.progress`),
 * `insert` writes new values, `animate` drives one on the compositor, and
 * `close` releases it. A member that was not declared, or a value of the wrong
 * shape, fails to compile.
 *
 * @param input - The element whose compositor makes the set, and the members with their first values.
 * @returns The property set.
 */
export function createPropertySet<Values extends Readonly<Record<string, MemberValue>>>({ element, values }: {
  element: UIElement;
  values: Values;
}) {
  const { compositor } = ElementCompositionPreview.getElementVisual(element);
  const native = compositor.createPropertySet();
  for (const [name, value] of Object.entries(values)) {
    insert({
      native,
      name,
      value
    });
  }

  return {
    /** The CompositionPropertySet itself. */
    native,
    /** The members, for expressions to read. */
    reference: reference({
      name: nextReferenceName(),
      members: kindsOfValues(values),
      source: native
    }),
    /** Writes new values of some members. */
    insert(changes: Partial<Values>) {
      for (const [name, value] of Object.entries(changes)) {
        const isGiven = value !== undefined;
        if (isGiven) {
          insert({
            native,
            name,
            value
          });
        }
      }
    },
    /** Animates a member, or one component of a vector member, on the compositor. */
    animate<Property extends PropertyName<KindsOfValues<Values>>>({ property, animation }:
    AnimationOptions<KindsOfValues<Values>, Property>) {
      return startAnimation({
        target: native,
        property,
        animation
      });
    },
    /** Releases the set; the expressions that read it stop reading it. */
    close() {
      native.close();
    }
  };
}

/** A property set made by `createPropertySet`. */
export type PropertySet<Values extends Readonly<Record<string, MemberValue>>> =
  ReturnType<typeof createPropertySet<Values>>;
