// The control properties of the CSS part (`font-stretch`, `direction`, `background-clip`,
// `tab-index`), apart from the entry (index.ts) so a window's bundle carries their parser
// only when a sheet uses one: the module a compiled sheet imports when it has one.

export { controlGroups } from "./translate/text-control-properties.ts";
