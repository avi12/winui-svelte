// The props of the settings components. Kept out of the .d.svelte.ts files so
// the components can import them (the Svelte language server reads
// `./SettingsCard.d.svelte.ts` imported from SettingsCard.svelte as
// SettingsCard.svelte itself).
import type { GlyphInput } from "#src/components/convert.js";
import type { Snippet } from "svelte";

/** The Fluent glyph a card's action shows when it can be clicked: a chevron pointing onwards. */
export const DEFAULT_ACTION_GLYPH = "ChevronRight";

/** What the header row of a settings card or expander is made of. */
export interface SettingsRowProps {
  /** The setting's name. */
  header: string;

  /** A line under the header that says what the setting does. */
  description?: string | undefined;

  /** An icon before the header: a Fluent glyph, or a snippet that draws one. */
  headerIcon?: GlyphInput | Snippet | undefined;

  /** The setting's control, on the right: a switch, a combo box, a button. */
  children?: Snippet;
}

/** The props of `SettingsCard`. */
export interface SettingsCardProps extends SettingsRowProps {
  /** Makes the whole card a button: it takes focus, answers Enter and Space, and raises `onclick`. */
  isClickEnabled?: boolean | undefined;

  /** The glyph at the end of a clickable card; default: a chevron pointing right. */
  actionIcon?: GlyphInput | undefined;

  /** Replaces the action icon with anything else (an external-link glyph, a button). */
  action?: Snippet;

  /** Whether the card answers input; default: true. */
  isEnabled?: boolean | undefined;

  /** The id UI Automation tools and tests find the card by. */
  automationId?: string | undefined;

  /** Called when a clickable card is clicked or activated with the keyboard. */
  onclick?: (() => void) | undefined;
}

/** The props of `SettingsExpander`: a card whose items open below it. */
export interface SettingsExpanderProps extends SettingsRowProps {
  /** Whether the items are shown (`bind:isExpanded`). */
  isExpanded?: boolean | undefined;

  /** The id UI Automation tools and tests find the expander by. */
  automationId?: string | undefined;

  /** The items: `SettingsCard`s, which draw flat inside the expander. */
  items?: Snippet;
}
