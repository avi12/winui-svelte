import { computeDeclarations, resolveBuiltVariable } from "#src/css/translate/cascade.js";
import { loadWinuiCatalogue } from "#src/css/translate/catalogue.js";
import { buildTimeGroups, LAZY_GROUPS } from "#src/css/translate/lazy-groups.js";
import { lowerDeclarations, propertyGroups } from "#src/css/translate/properties.js";
import { translateStyleSheet } from "#src/css/translate/translate.js";

// Values that between them make every group lower something: a group does not
// declare the WinUI properties it sets, so the generator asks the translator
const PROBE_VALUES = [
  "1px",
  "red",
  "auto",
  "none",
  "0",
  "1",
  "1s",
  "bold",
  "italic",
  "normal",
  "nowrap",
  "ellipsis",
  "hidden",
  "underline",
  "center",
  "row",
  "wrap",
  "flex",
  "break-all",
  "1px 2px",
  "10px 20px 30px 40px",
  "1px solid red",
  "ease 1s",
  "rotate(10deg)",
  "linear-gradient(red, blue)"
];

const resources = loadWinuiCatalogue();
const extraGroups = LAZY_GROUPS.flatMap(lazy => lazy.groups());

/**
 * What the translator lowers one CSS declaration to: the Style setters, each
 * the WinUI property and the value it is set to; none where the declaration
 * lowers to nothing (a value the property does not take).
 */
export function settersOf({ cssName, value }: {
  cssName: string;
  value: string;
}) {
  const { sheet } = translateStyleSheet({
    file: "probe.svelte",
    css: `.probe { ${cssName}: ${value} }`,
    resources
  });
  const [rule] = sheet.rules;
  const isMissing = rule === undefined;
  if (isMissing) {
    return [];
  }

  return lowerDeclarations({
    computed: computeDeclarations({
      matched: [rule],
      inline: []
    }),
    options: {
      elementType: null,
      resolveVariable: resolveBuiltVariable,
      hasStyle: () => true,
      report() {}
    },
    extraGroups
  }).setters;
}

function winuiPropertiesOf(cssName: string) {
  const properties = new Set<string>();
  for (const value of PROBE_VALUES) {
    for (const setter of settersOf({
      cssName,
      value
    })) {
      properties.add(setter.property.toLowerCase());
    }
  }

  return properties;
}

// Where the narrowest CSS setter has the wrong meaning: CSS `visibility` keeps the space of
// a hidden element, which Collapsed does not, so Visibility is documented as `display`
const PREFERRED_CSS_NAMES = new Map([["visibility", "display"]]);

// For each WinUI property, the CSS property that sets it and the fewest others
function buildCssNames() {
  const groups = [...propertyGroups, ...LAZY_GROUPS.flatMap(lazy => lazy.groups()), ...buildTimeGroups()];
  const candidates = new Set(groups.flatMap(group => [...group.members, ...group.shorthands?.keys() ?? []]));
  const setBy = new Map<string, {
    cssName: string;
    breadth: number;
  }[]>();
  for (const cssName of candidates) {
    const properties = winuiPropertiesOf(cssName);
    for (const property of properties) {
      const list = setBy.get(property) ?? [];
      list.push({
        cssName,
        breadth: properties.size
      });
      setBy.set(property, list);
    }
  }

  return new Map(
    [...setBy].map(([property, list]) => {
      const preferred = PREFERRED_CSS_NAMES.get(property);
      const isPreferred = list.some(entry => entry.cssName === preferred);
      const [narrowest] = list.toSorted((first, second) => first.breadth - second.breadth);
      return [property, isPreferred ? preferred : narrowest?.cssName] as const;
    })
  );
}

const cssNames = buildCssNames();

/** Every WinUI property CSS can set, lowercase, with the CSS property that sets it (the narrowest one). */
export function cssNameEntries() {
  return [...cssNames].flatMap(([property, cssName]) => cssName === undefined ? [] : [{
    property,
    cssName
  }]);
}

// The sentence of a WinUI property's documentation that names the CSS property
// setting it, or nothing where CSS has none
export function cssNoteOf(winName: string) {
  const cssName = cssNames.get(winName.toLowerCase());
  const isSettable = cssName !== undefined;
  return isSettable ? `Also settable in CSS as \`${cssName}\`` : undefined;
}
