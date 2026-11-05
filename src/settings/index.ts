// The Fluent settings pages' building blocks: a card for one setting and an
// expander that holds more of them, after the Windows Community Toolkit's
// SettingsCard and SettingsExpander (managed code with no projectable metadata,
// so they are built here from WinUI's own controls).

export { default as SettingsCard } from "./SettingsCard.svelte";
export type { SettingsCardProps } from "./SettingsCard.d.svelte.ts";
export { default as SettingsExpander } from "./SettingsExpander.svelte";
export type { SettingsExpanderProps } from "./SettingsExpander.d.svelte.ts";
