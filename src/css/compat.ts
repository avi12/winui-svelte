// The properties of browser stylesheets (word-break, user-select, object-fit, line-clamp,
// box-sizing) of the CSS part, apart from the entry (index.ts) so a window's
// bundle carries them only when a sheet has one: the module a compiled sheet
// imports then.

export { compatGroups } from "./translate/compat-properties.ts";
