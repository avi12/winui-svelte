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

function winuiPropertiesOf(cssName: string) {
  const properties = new Set<string>();
  for (const value of PROBE_VALUES) {
    const { sheet } = translateStyleSheet({
      file: "probe.svelte",
      css: `.probe { ${cssName}: ${value} }`,
      resources
    });
    const [rule] = sheet.rules;
    const isMissing = rule === undefined;
    if (isMissing) {
      continue;
    }

    const lowered = lowerDeclarations({
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
    });
    for (const setter of lowered.setters) {
      properties.add(setter.property.toLowerCase());
    }
  }

  return properties;
}

// For each WinUI property, the CSS property that sets it and the fewest others
function buildCssNames() {
  const groups = [...propertyGroups, ...LAZY_GROUPS.flatMap(lazy => lazy.groups()), ...buildTimeGroups()];
  const candidates = new Set(groups.flatMap(group => [...group.members, ...group.shorthands?.keys() ?? []]));
  const setBy = new Map<string, Array<{
    cssName: string;
    breadth: number;
  }>>();
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
      const [narrowest] = list.toSorted((first, second) => first.breadth - second.breadth);
      return [property, narrowest?.cssName] as const;
    })
  );
}

const cssNames = buildCssNames();

// The sentence of a WinUI property's documentation that names the CSS property
// setting it, or nothing where CSS has none
export function cssNoteOf(winName: string) {
  const cssName = cssNames.get(winName.toLowerCase());
  const isSettable = cssName !== undefined;
  return isSettable ? `Also settable in CSS as \`${cssName}\`` : undefined;
}
