import { inputTypeOf } from "./emit.ts";
import type { ClassModel } from "./model.ts";

function keysOf({ component, inputType }: {
  component: ClassModel;
  inputType: string;
}) {
  const keys: string[] = [];
  for (let level: ClassModel | null = component; level !== null; level = level.parent) {
    const matching = level.properties.filter(property => inputTypeOf(property) === inputType);
    keys.push(...matching.map(property => property.key));
  }

  return keys.toSorted();
}

/**
 * For each component, the props whose input type is the given one, inherited ones included.
 */
export function propsOfInputType({ classes, inputType }: {
  classes: ClassModel[];
  inputType: string;
}) {
  return Object.fromEntries(
    classes
      .filter(level => level.isComponent)
      .map(level => [level.type.name, keysOf({
        component: level,
        inputType
      })] as const)
      .filter(([, keys]) => keys.length > 0)
      .toSorted(([first], [second]) => first.localeCompare(second))
  );
}
