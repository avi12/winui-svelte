// The color a WinUI theme resource shows in the light and in the dark theme,
// read from generic.xaml's `Light` and `Default` (dark) dictionaries, for the
// editors' swatch beside `var(--card-background-fill-color-default)`. A color
// that follows the system (the accent colors) has no fixed value and gets none.

const THEME_DICTIONARY = /^ {8}<ResourceDictionary x:Key="(\w+)">/u;
const COLOR_ELEMENT = /<Color\s+x:Key="([^"]+)">([^<]+)<\/Color>/u;
// A brush with an Opacity is no plain color, so it gets no swatch.
const BRUSH_ELEMENT = /<(?:media:)?SolidColorBrush\s+x:Key="([^"]+)"\s+Color="([^"]+)"(?![^>]*Opacity=)/u;
const ALIAS_ELEMENT = /<StaticResource\s+x:Key="([^"]+)"\s+ResourceKey="([^"]+)"/u;
const REFERENCE = /^\{(?:Static|Theme)Resource\s+([^}]+)\}$/u;
const HEX_COLOR = /^#([\da-f]{6}|[\da-f]{8})$/iu;
const TRANSPARENT = "transparent";
const OPAQUE_ALPHA = "ff";
const ALPHA_DIGITS = 2;
const ALPHA_COLOR_DIGITS = 8;
const MAX_REFERENCE_DEPTH = 8;

const SwatchTheme = {
  LIGHT: "light",
  DARK: "dark"
} as const;

type SwatchTheme = typeof SwatchTheme[keyof typeof SwatchTheme];

const themeOfDictionary = new Map<string, SwatchTheme>([
  ["Light", SwatchTheme.LIGHT],
  ["Default", SwatchTheme.DARK]
]);

// XAML writes #AARRGGBB; CSS writes #RRGGBBAA, and an opaque color needs no alpha.
function cssColorOf(xamlColor: string) {
  const isTransparent = xamlColor === "Transparent";
  if (isTransparent) {
    return TRANSPARENT;
  }

  const digits = HEX_COLOR.exec(xamlColor)?.[1]?.toLowerCase();
  const isHex = digits !== undefined;
  if (!isHex) {
    return undefined;
  }

  const hasAlpha = digits.length === ALPHA_COLOR_DIGITS;
  if (!hasAlpha) {
    return `#${digits}`;
  }

  const alpha = digits.slice(0, ALPHA_DIGITS);
  const color = digits.slice(ALPHA_DIGITS);
  return alpha === OPAQUE_ALPHA ? `#${color}` : `#${color}${alpha}`;
}

function resolved({ definitions, name, depth }: {
  definitions: ReadonlyMap<string, string>;
  name: string;
  depth: number;
}) {
  const written = definitions.get(name);
  const isUndefined = written === undefined || depth > MAX_REFERENCE_DEPTH;
  if (isUndefined) {
    return undefined;
  }

  const target = REFERENCE.exec(written)?.[1];
  const isReference = target !== undefined;
  if (isReference) {
    return resolved({
      definitions,
      name: target,
      depth: depth + 1
    });
  }

  return cssColorOf(written);
}

function definitionsByTheme(xaml: string) {
  const byTheme = new Map<SwatchTheme, Map<string, string>>([
    [SwatchTheme.LIGHT, new Map()],
    [SwatchTheme.DARK, new Map()]
  ]);
  let current: Map<string, string> | undefined;
  for (const line of xaml.split("\n")) {
    const dictionary = THEME_DICTIONARY.exec(line)?.[1];
    const isDictionaryStart = dictionary !== undefined;
    if (isDictionaryStart) {
      const theme = themeOfDictionary.get(dictionary);
      current = theme === undefined ? undefined : byTheme.get(theme);
    }

    const definitions = current;
    const written = COLOR_ELEMENT.exec(line) ?? BRUSH_ELEMENT.exec(line);
    const alias = ALIAS_ELEMENT.exec(line);
    const [, aliasKey, aliasTarget] = alias ?? [];
    const [, key, value] = written ?? [];
    const isAlias = definitions !== undefined && aliasKey !== undefined && aliasTarget !== undefined;
    if (isAlias) {
      definitions.set(aliasKey, `{StaticResource ${aliasTarget}}`);
    }

    const isDefinition = definitions !== undefined && key !== undefined && value !== undefined;
    if (isDefinition) {
      definitions.set(key, value.trim());
    }
  }

  return byTheme;
}

/**
 * The CSS color of every color, brush and alias of generic.xaml in the light and the dark theme, as
 * `[light, dark]` by resource key; a theme where the color follows the system is `null`, and a resource
 * with neither is left out.
 */
export function themeSwatches(xaml: string) {
  const byTheme = definitionsByTheme(xaml);
  const light = byTheme.get(SwatchTheme.LIGHT) ?? new Map<string, string>();
  const dark = byTheme.get(SwatchTheme.DARK) ?? new Map<string, string>();
  const swatches = new Map<string, [string | null, string | null]>();
  for (const name of new Set([...light.keys(), ...dark.keys()])) {
    const pair: [string | null, string | null] = [
      resolved({
        definitions: light,
        name,
        depth: 0
      }) ?? null,
      resolved({
        definitions: dark,
        name,
        depth: 0
      }) ?? null
    ];
    const isShown = pair[0] !== null || pair[1] !== null;
    if (isShown) {
      swatches.set(name, pair);
    }
  }

  return swatches;
}
