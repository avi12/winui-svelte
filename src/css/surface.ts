// The `-winui-elevation` and `backdrop-filter` properties of the CSS part, apart
// from the entry (index.ts) so a window's bundle carries their parsers only when
// a sheet uses one: the module a compiled sheet imports when it has one.

export { surfaceGroups } from "./translate/surface-properties.ts";
