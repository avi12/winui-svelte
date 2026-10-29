// The `animation` property and its `@keyframes` of the CSS part, apart from the
// entry (index.ts) so a window's bundle carries their parser only when a sheet
// uses one: the module a compiled sheet imports when it has an `animation`.

export { animationGroups } from "./translate/animation-properties.ts";
