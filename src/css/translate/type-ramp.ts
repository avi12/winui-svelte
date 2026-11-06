import type { ExpansionInput } from "./property-kit.ts";
import { expandFont, longhand } from "./shorthands.ts";
import { parseVariable } from "#src/css/parse/values.js";
import { customPropertyOf, resourceNameOf } from "#src/css/runtime/resources.js";

const RAMP_PREFIX = "--type-";
const REGULAR = "normal";
const SEMI_BOLD = "600";

// WinUI's type ramp (generic.xaml's TextBlock styles), each step as
// `var(--type-<step>)` names it, with its style's weight; its size is the
// step's `<Step>TextBlockFontSize` resource, so it follows WinUI's.
const TYPE_RAMP: ReadonlyMap<string, string> = new Map([
  ["caption", REGULAR],
  ["body", REGULAR],
  ["body-strong", SEMI_BOLD],
  ["body-large", REGULAR],
  ["subtitle", SEMI_BOLD],
  ["title", SEMI_BOLD],
  ["title-large", SEMI_BOLD],
  ["display", SEMI_BOLD]
]);

function typeRampSteps() {
  return [...TYPE_RAMP].map(([step, weight]) => {
    const name = resourceNameOf(step);
    return {
      property: `${RAMP_PREFIX}${step}`,
      size: customPropertyOf(`${name}TextBlockFontSize`),
      weight
    };
  });
}

/**
 * `font: var(--type-title)`: a step of WinUI's type ramp, as the font size
 * resource and the weight of the step's TextBlock style. Any other value is
 * the `font` shorthand.
 */
export function expandTypeRamp(input: ExpansionInput) {
  const name = parseVariable(input.declaration.value.trim())?.name ?? "";
  const isRamp = name.startsWith(RAMP_PREFIX);
  if (!isRamp) {
    return expandFont(input);
  }

  const step = typeRampSteps().find(candidate => candidate.property === name);
  if (!step) {
    input.reader.error(`font: ${name} is not a step of WinUI's type ramp; write one of ${typeRampSteps().map(candidate => `var(${candidate.property})`).join(", ")}`);
    return [];
  }

  return [
    longhand({
      declaration: input.declaration,
      property: "font-size",
      value: `var(${step.size})`
    }),
    longhand({
      declaration: input.declaration,
      property: "font-weight",
      value: step.weight
    })
  ];
}
