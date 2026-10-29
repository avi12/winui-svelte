// The lengths that depend on the layout (`calc(100% - 2rem)`, `clamp(10px, 5vw, 40px)`)
// of the CSS part, apart from the entry (index.ts) so a window's bundle carries
// their runtime only when a sheet has one: the module a compiled sheet imports then.

export { dynamicLengthGroups } from "./translate/dynamic-length-properties.ts";
