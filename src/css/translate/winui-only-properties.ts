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
    description: "The depth of the element's ThemeShadow, in px: a WinUI shadow that follows the theme. It has no colour, offset or blur; -winui-shadow: composition draws box-shadow with those."
  },
  {
    name: "-winui-shadow",
    syntax: "theme | composition",
    description: "How box-shadow is drawn: theme (the default) is a ThemeShadow whose depth is the blur; composition is a Composition DropShadow that keeps the colour, x and y offset, blur and spread (not inset), cut out under the element."
  },
  {
    name: "-winui-shadow-receiver",
    syntax: "<name>",
    description: "Makes the element a receiver of the ThemeShadows whose elements name the same group in -winui-shadow-cast-on (before Windows 11 a ThemeShadow draws only on its receivers)."
  },
  {
    name: "-winui-shadow-cast-on",
    syntax: "<name>",
    description: "Sets the Receivers of the element's ThemeShadow (set by -winui-elevation) to the elements that name the same group in -winui-shadow-receiver."
  }
];
