// The shape properties of the CSS part, apart from the entry (index.ts) so a
// window's bundle carries their parser only when a sheet uses one: the module a
// compiled sheet imports when it has a `fill`, a `stroke-dasharray` and the like.

export { shapeGroups } from "./translate/shape-properties.ts";
