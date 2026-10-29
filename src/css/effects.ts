// The `clip-path` and `aspect-ratio` properties of the CSS part, apart from the
// entry (index.ts) so a window's bundle carries their parsers only when a sheet
// uses one: the module a compiled sheet imports when it has one.

export { effectGroups } from "./translate/effect-properties.ts";
