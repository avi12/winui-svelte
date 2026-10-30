import { ANIMATION_MEMBERS, animationGroups } from "./animation-properties.ts";
import { gradientGroups } from "./background-properties.ts";
import { buildShorthandGroups } from "./build-shorthands.ts";
import { COMPAT_MEMBERS, compatGroups } from "./compat-properties.ts";
import { CONTAINER_MEMBERS, containerGroups } from "./container-properties.ts";
import { EFFECT_MEMBERS, effectGroups } from "./effect-properties.ts";
import { focusGroups, OUTLINE_MEMBERS } from "./focus-properties.ts";
import { POSITION_MEMBERS, positionGroups } from "./position-properties.ts";
import type { PropertyGroup } from "./property-kit.ts";
import { queryGroups } from "./query-properties.ts";
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
    isNeededBy: usesProperties(["transform", "transform-origin", "translate", "scale", "rotate", "transition"]),
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
    isNeededBy: usesProperties(EFFECT_MEMBERS),
    subpath: "/effects",
    exportName: "effectGroups",
    groups: effectGroups
  },
  {
    isNeededBy: usesProperties(POSITION_MEMBERS),
    subpath: "/position",
    exportName: "positionGroups",
    groups: positionGroups
  },
  {
    isNeededBy: usesProperties(CONTAINER_MEMBERS),
    subpath: "/container",
    exportName: "containerGroups",
    groups: containerGroups
  },
  {
    isNeededBy: usesProperties(COMPAT_MEMBERS),
    subpath: "/compat",
    exportName: "compatGroups",
    groups: compatGroups
  },
  {
    isNeededBy: rule => rule.media !== undefined || rule.startingStyle === true,
    subpath: "/queries",
    exportName: "queryGroups",
    groups: queryGroups
  },
  {
    isNeededBy: rule => rule.resourcesXaml !== null,
    subpath: "/resources",
    exportName: "resourceGroups",
    groups: resourceGroups
  }
];

/** The groups only the build uses: what a sheet's declarations are expanded and checked with, never a window. */
export const BUILD_GROUPS: ReadonlyArray<() => PropertyGroup[]> = [buildShorthandGroups];
