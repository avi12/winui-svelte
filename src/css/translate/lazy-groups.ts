import { ANIMATION_MEMBERS, animationGroups } from "./animation-properties.ts";
import { gradientGroups } from "./background-properties.ts";
import { focusGroups, OUTLINE_MEMBERS } from "./focus-properties.ts";
import type { PropertyGroup } from "./property-kit.ts";
import { resourceGroups } from "./resource-properties.ts";
import { SURFACE_MEMBERS, surfaceGroups } from "./surface-properties.ts";
import { transformGroups } from "./transform-properties.ts";
import type { Rule } from "./types.ts";

/**
 * A set of property groups a sheet opts into, apart from the built-in ones, so
 * a window whose sheets use none of it carries none of its parser.
 */
export interface LazyGroups {
  /** Whether a rule opts its sheet in. */
  isNeededBy(rule: Rule): boolean;
  /** The subpath of the runtime module (`winui-svelte/css` + it) that exports `exportName`. */
  subpath: string;
  exportName: string;
  groups(): PropertyGroup[];
}

function usesProperties(members: readonly string[]) {
  return (rule: Rule) => rule.declarations.some(declaration => members.includes(declaration.property));
}

/** Every opt-in set; the one place that lists them (the build validates with them, a sheet module imports them). */
export const LAZY_GROUPS: readonly LazyGroups[] = [
  {
    isNeededBy: usesProperties(["background-image"]),
    subpath: "/gradients",
    exportName: "gradientGroups",
    groups: gradientGroups
  },
  {
    isNeededBy: usesProperties(["transform", "transform-origin", "scale", "rotate", "transition"]),
    subpath: "/transform",
    exportName: "transformGroups",
    groups: transformGroups
  },
  {
    isNeededBy: usesProperties(OUTLINE_MEMBERS),
    subpath: "/focus",
    exportName: "focusGroups",
    groups: focusGroups
  },
  {
    isNeededBy: usesProperties(SURFACE_MEMBERS),
    subpath: "/surface",
    exportName: "surfaceGroups",
    groups: surfaceGroups
  },
  {
    isNeededBy: usesProperties(ANIMATION_MEMBERS),
    subpath: "/animation",
    exportName: "animationGroups",
    groups: animationGroups
  },
  {
    isNeededBy: rule => rule.resourcesXaml !== null,
    subpath: "/resources",
    exportName: "resourceGroups",
    groups: resourceGroups
  }
];
