// The OpenType font properties of the CSS part (`font-variant-*`, `font-kerning`,
// `font-feature-settings`, `font-optical-sizing`), apart from the entry
// (index.ts) so a window's bundle carries their parser only when a sheet uses
// one: the module a compiled sheet imports when it has one.

export { typographyGroups } from "./translate/typography-properties.ts";
