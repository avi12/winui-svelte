// The gradient backgrounds of the CSS part, apart from the entry (index.ts)
// so a window's bundle carries their parser only when a sheet uses one: the
// module a compiled sheet imports when it has a `background-image`.

export { gradientGroups } from "./translate/background-properties.ts";
