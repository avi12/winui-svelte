import { setter } from "./property-kit.ts";
import type { PropertyGroup } from "./property-kit.ts";
import type { Reader } from "#src/css/parse/reader.js";
import type { ResourceKind } from "#src/css/runtime/resources.js";

/** The four sides of a box, in the order CSS writes them. */
export const SIDES = ["top", "right", "bottom", "left"] as const;

/** The four corners of a box, in the order CSS writes them. */
export const CORNERS = ["top-left", "top-right", "bottom-right", "bottom-left"] as const;

const HIDDEN_BORDER_STYLES = ["none", "hidden"];

// A box property whose whole value is one `var()` holding the Thickness or
// CornerRadius: the resource's markup as the setter, or nothing after an error.
function wholeVariableSetters({ reader, kind, property }: {
  reader: Reader;
  kind: ResourceKind;
  property: string;
}) {
  const word = reader.single();
  const resource = word === null ? null : reader.variable({
    token: word,
    kind
  });
  return typeof resource === "string" ? [setter({
    property,
    value: resource
  })] : [];
}

// One side or corner in pixels: 0 when it is not written. A longhand is read
// even when it is ignored, so a value it cannot take is still reported.
function pixelsOf({ reader, isIgnored = false }: {
  reader: Reader | undefined;
  isIgnored?: boolean;
}) {
  const word = reader?.single();
  const isUnset = reader === undefined || word === null || word === undefined;
  if (isUnset) {
    return 0;
  }

  return isIgnored ? 0 : reader.pixels(word) ?? 0;
}

/** Padding and margin: four sides, 0 for a side left out; or one `var()` holding the whole Thickness. */
export function thicknessGroup({ name, property }: {
  name: string;
  property: string;
}) {
  const members = [name, ...SIDES.map(side => `${name}-${side}`)];
  return {
    members,
    lower(input) {
      const whole = input.readers.get(name);
      const hasWholeValue = whole !== undefined;
      if (hasWholeValue) {
        return wholeVariableSetters({
          reader: whole,
          kind: "Thickness",
          property
        });
      }

      const [top, right, bottom, left] = SIDES.map(side => pixelsOf({ reader: input.readers.get(`${name}-${side}`) }));
      return [setter({
        property,
        value: `${left},${top},${right},${bottom}`
      })];
    }
  } satisfies PropertyGroup;
}

/** The border's width on each side, or none when `border-style` hides it. */
export function borderThickness() {
  const members = ["border-width", "border-style", ...SIDES.map(side => `border-${side}-width`)];
  return {
    members,
    lower(input) {
      const whole = input.readers.get("border-width");
      const hasWholeValue = whole !== undefined;
      if (hasWholeValue) {
        return wholeVariableSetters({
          reader: whole,
          kind: "Thickness",
          property: "BorderThickness"
        });
      }

      const style = input.readers.get("border-style")?.declaration.value.toLowerCase() ?? "";
      const isHidden = HIDDEN_BORDER_STYLES.includes(style);
      const [top, right, bottom, left] = SIDES.map(side => pixelsOf({
        reader: input.readers.get(`border-${side}-width`),
        isIgnored: isHidden
      }));
      const hasBorder = input.readers.has("border-style") || SIDES.some(side => input.readers.has(`border-${side}-width`));
      return hasBorder ? [setter({
        property: "BorderThickness",
        value: `${left},${top},${right},${bottom}`
      })] : [];
    }
  } satisfies PropertyGroup;
}

/** The border's radius at each corner, or one `var()` holding the whole CornerRadius. */
export function cornerRadius() {
  const members = ["border-radius", ...CORNERS.map(corner => `border-${corner}-radius`)];
  return {
    members,
    lower(input) {
      const whole = input.readers.get("border-radius");
      const hasWholeValue = whole !== undefined;
      if (hasWholeValue) {
        return wholeVariableSetters({
          reader: whole,
          kind: "CornerRadius",
          property: "CornerRadius"
        });
      }

      const [topLeft, topRight, bottomRight, bottomLeft] = CORNERS.map(corner => pixelsOf({
        reader: input.readers.get(`border-${corner}-radius`)
      }));
      return [setter({
        property: "CornerRadius",
        value: `${topLeft},${topRight},${bottomRight},${bottomLeft}`
      })];
    }
  } satisfies PropertyGroup;
}
