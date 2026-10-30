/** A property only WinUI has: CSS itself does not know it, so an editor needs telling. */
export interface WinuiOnlyProperty {
  name: string;
  syntax: string;
  description: string;
}

/**
 * The `-winui-*` properties and what each does. The validator's test checks
 * that every one is a property the translation really handles, and that no
 * handled one is missing, so this list cannot drift from the property table.
 */
export const WINUI_ONLY_PROPERTIES: readonly WinuiOnlyProperty[] = [
  {
    name: "-winui-based-on",
    syntax: "<resource-key>",
    description: "The WinUI Style this rule is based on (a key such as BodyTextBlockStyle): the rule's declarations are set on top of it."
  },
  {
    name: "-winui-elevation",
    syntax: "<length>",
    description: "The depth of the element's ThemeShadow, in px: a WinUI shadow that follows the theme."
  }
];
