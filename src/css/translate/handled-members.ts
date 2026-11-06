import { BUILD_GROUPS, LAZY_GROUPS } from "./lazy-groups.ts";
import { propertyGroups } from "./properties.ts";

/**
 * Every CSS property the translation handles, the built-in groups, the opt-in ones and the ones the build adds:
 * the one list the editor data and its tests are checked against.
 */
export function handledMembers() {
  const groups = [
    ...propertyGroups,
    ...LAZY_GROUPS.flatMap(lazy => lazy.groups()),
    ...BUILD_GROUPS.flatMap(build => build())
  ];
  return new Set(groups.flatMap(group => group.members));
}
