import type { GroupInput, PropertyGroup, WriteContext } from "./property-kit.ts";
import { parseNumber, splitSlash } from "#src/css/parse/values.js";

const ASPECT_RATIO = "aspect-ratio";
const ASPECT_TARGET = "aspect";
const MIN_ASPECT_CHANGE = 0.5;

/**
 * `aspect-ratio`: `auto`, a number or `w / h`. WinUI has none, so the element's
 * Height follows its Width (as laid out) on every size change. An element that
 * also has a `height` gets the ratio's, which a warning says.
 */
function aspectRatio(input: GroupInput) {
  const reader = input.reading(ASPECT_RATIO);
  const text = reader.declaration.value.trim();
  const isAuto = text.toLowerCase() === "auto";
  if (isAuto) {
    return [];
  }

  const [width = "", height = "1"] = splitSlash(text).map(part => part.trim());
  const [wide, tall] = [parseNumber(width), parseNumber(height)];
  const isRatio = wide !== null && tall !== null && wide > 0 && tall > 0;
  if (!isRatio) {
    reader.expected("auto, a positive number or two separated by a slash");
    return [];
  }

  if (input.computed.has("height")) {
    reader.warn(`${ASPECT_RATIO}: with a height set, the ratio wins (CSS would use the height)`);
  }

  return [{
    kind: "write",
    target: ASPECT_TARGET,
    value: String(wide / tall)
  } as const];
}

function followRatio({ native, control, value }: WriteContext) {
  const ratio = Number(value);
  function place() {
    const width = Number(
      native.read({
        control,
        property: "actualWidth"
      }) ?? 0
    );
    const current = Number(
      native.read({
        control,
        property: "actualHeight"
      }) ?? 0
    );
    const target = width / ratio;
    const isChanged = width > 0 && Math.abs(current - target) > MIN_ASPECT_CHANGE;
    if (isChanged) {
      native.assign(control, { height: target });
    }
  }

  place();
  return native.subscribe(control, "SizeChanged", place);
}

/**
 * The property group of `aspect-ratio`. Apart from the
 * built-in groups, as the gradients are: a sheet that uses one registers them.
 */
export function effectGroups() {
  return [
    {
      members: [ASPECT_RATIO],
      lower: aspectRatio,
      writes: {
        [ASPECT_TARGET]: followRatio
      }
    }
  ] satisfies PropertyGroup[];
}

/** The members the effect groups are lowered from. */
export const EFFECT_MEMBERS = [ASPECT_RATIO];
