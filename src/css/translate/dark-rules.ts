import { ColorScheme } from "./types.ts";
import type { Declaration, Rule } from "./types.ts";
import type { Variable } from "./variables.ts";

const DARK_SCHEME = "(prefers-color-scheme: dark)";
const QUARTER_STEP = 0.25;
const VARIABLE = /var\((--[\w-]+)\)/gu;

// The literal each name stands for in the default (light) theme and in the dark one.
function valuesOf(variables: readonly Variable[]) {
  const light = new Map<string, string>();
  const dark = new Map<string, string>();
  for (const { name, value, scheme } of variables) {
    const isDark = scheme === ColorScheme.DARK;
    const isBase = scheme === ColorScheme.DEFAULT || scheme === ColorScheme.LIGHT;
    if (isDark) {
      dark.set(name, value);
    }

    if (isBase) {
      light.set(name, value);
    }
  }

  return {
    light,
    dark
  };
}

function substituted({ declaration, values }: {
  declaration: Declaration;
  values: ReadonlyMap<string, string>;
}) {
  return {
    property: declaration.property,
    isImportant: declaration.isImportant,
    at: declaration.at,
    value: declaration.value.replaceAll(VARIABLE, (whole, name: string) => values.get(name) ?? whole)
  } satisfies Declaration;
}

function referencesDark({ declaration, dark }: {
  declaration: Declaration;
  dark: ReadonlyMap<string, string>;
}) {
  const isCustom = declaration.property.startsWith("--");
  return !isCustom && [...declaration.value.matchAll(VARIABLE)].some(([, name = ""]) => dark.has(name));
}

/**
 * A declaration that reads a custom property (or a `light-dark()`) with a dark
 * value is written out for both themes: the rule keeps the light value and a
 * copy under `prefers-color-scheme: dark` has the dark one. WinUI does not read
 * a Style's theme resource again when the theme of the element changes, while
 * a rule under a media query restyles live, so this is what makes a color
 * follow the theme as it changes.
 *
 * @param options - The rules of a sheet, in place (the copies are added), and its custom properties.
 */
export function addDarkRules({ rules, variables }: {
  rules: Rule[];
  variables: readonly Variable[];
}) {
  const { light, dark } = valuesOf(variables);
  const added: Rule[] = [];
  for (const rule of rules) {
    const affected = rule.declarations.filter(declaration => referencesDark({
      declaration,
      dark
    }));
    const own = rule.media?.query;
    const isSkipped = affected.length === 0 || rule.startingStyle === true || rule.media?.container !== undefined || own?.includes(",") === true;
    if (isSkipped) {
      continue;
    }

    added.push({
      ...rule,
      order: rule.order + QUARTER_STEP,
      declarations: affected.map(declaration => substituted({
        declaration,
        values: dark
      })),
      media: {
        minWidth: rule.media?.minWidth ?? null,
        maxWidth: rule.media?.maxWidth ?? null,
        minHeight: rule.media?.minHeight ?? null,
        maxHeight: rule.media?.maxHeight ?? null,
        query: own === undefined ? DARK_SCHEME : `${own} and ${DARK_SCHEME}`
      },
      resourcesXaml: null
    });
    rule.declarations = rule.declarations.map(declaration => (affected.includes(declaration) ? substituted({
      declaration,
      values: light
    }) : declaration));
  }

  rules.push(...added);
}
