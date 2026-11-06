import { read } from "./reflect.ts";
import { MOTION_ALWAYS_CLASS } from "#src/motion.js";
import { isMotionReducedBySystem } from "#src/window/reduced-motion.js";

// Whether the user's reduced-motion setting takes the motion from an element:
// the one answer the element animation engine and the scroll timelines share.

/**
 * Whether an element carries the class that keeps its motion under reduced motion.
 *
 * @param node - The tree's element.
 * @returns True for an element with `winui-motion-always`.
 */
export function keepsMotion(node: object) {
  const classes = read(node, "className");
  return typeof classes === "string" && classes.split(" ").includes(MOTION_ALWAYS_CLASS);
}

/**
 * Whether reduced motion takes the motion from an element: the setting is on
 * (Windows' by default) and the element does not keep its motion.
 *
 * @param input - The tree's element, and the setting when it is not Windows'.
 * @returns True when the element's animations are skipped.
 */
export function isMotionReducedFor({ node, isMotionReduced = isMotionReducedBySystem }: {
  node: object;
  isMotionReduced?: () => boolean;
}) {
  return isMotionReduced() && !keepsMotion(node);
}
