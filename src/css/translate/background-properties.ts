import type { PropertyGroup } from "./property-kit.ts";
import { parseGradient } from "#src/css/parse/gradients.js";
import type { Gradient } from "#src/css/parse/gradients.js";
import { splitCommas } from "#src/css/parse/values.js";

const MEMBER = "background-image";

function pair({ x, y }: {
  x: number;
  y: number;
}) {
  return `${x},${y}`;
}

/** The XAML of the brush a gradient is: a LinearGradientBrush or a RadialGradientBrush with its GradientStops. */
function gradientXaml(gradient: Gradient) {
  const stops = gradient.stops.map(stop => `<GradientStop Color="${stop.color}" Offset="${stop.offset}"/>`).join("");
  const isLinear = gradient.kind === "linear";
  if (isLinear) {
    return `<LinearGradientBrush StartPoint="${pair(gradient.start)}" EndPoint="${pair(gradient.end)}">${stops}</LinearGradientBrush>`;
  }

  const center = pair(gradient.center);
  return `<RadialGradientBrush Center="${center}" GradientOrigin="${center}" RadiusX="${gradient.radiusX}" RadiusY="${gradient.radiusY}">${stops}</RadialGradientBrush>`;
}

/**
 * `background-image`: one `linear-gradient()` or `radial-gradient()`, set as
 * the Background brush. `none` sets nothing. A WinUI Background is one brush,
 * so a gradient replaces `background-color` where both are written.
 */
function backgroundImage() {
  return {
    members: [MEMBER],
    lower(input) {
      const reader = input.reading(MEMBER);
      const isLayered = splitCommas(reader.declaration.value).length > 1;
      if (isLayered) {
        reader.error(`${MEMBER}: several images have no WinUI meaning (a Background is one brush)`);
        return [];
      }

      const word = reader.single();
      const isNone = word === null || word.toLowerCase() === "none";
      if (isNone) {
        return [];
      }

      const result = parseGradient(word);
      if (!result.isValid) {
        reader.error(`${MEMBER}: ${result.reason}`);
        return [];
      }

      for (const warning of result.gradient.warnings) {
        reader.warn(`${MEMBER}: ${warning}`);
      }

      const hasColor = input.computed.has("background-color");
      if (hasColor) {
        reader.warn("background-color ignored (a WinUI Background is one brush, and the gradient replaces it)");
      }

      return [{
        kind: "content",
        property: "Background",
        xaml: gradientXaml(result.gradient)
      }];
    }
  } satisfies PropertyGroup;
}

/**
 * The property groups of a gradient background. Apart from the built-in
 * groups, since the parser for them is a tenth of what a window's bundle
 * carries: a sheet that uses one registers them (`registerPropertyGroups`).
 */
export function gradientGroups() {
  return [backgroundImage()];
}
