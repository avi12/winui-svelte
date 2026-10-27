/**
 * WinUI's resource names and how a CSS `var(--name)` finds one:
 *
 *   var(--card-background-fill-color-default)  ->  CardBackgroundFillColorDefaultBrush
 *
 * The name is the custom property in Pascal case; where a property takes a
 * brush, the `Brush` resource of that name is the one used (WinUI names a
 * color `CardBackgroundFillColorDefault` and its brush the same plus
 * `Brush`). Every name is checked against the list of resources WinUI really
 * defines (`winui-resources.g.json`, exported from generic.xaml), with a
 * suggestion when it is a typo.
 */
export const ResourceKind = {
  BRUSH: "Brush",
  COLOR: "Color",
  THICKNESS: "Thickness",
  DOUBLE: "Double",
  CORNER_RADIUS: "CornerRadius",
  FONT_WEIGHT: "FontWeight",
  FONT_FAMILY: "FontFamily",
  STRING: "String",
  BOOLEAN: "Boolean",
  GRID_LENGTH: "GridLength",
  /** A resource that is another resource; its kind is its target's. */
  ALIAS: "Alias",
  STYLE: "Style"
} as const;

/** One of the kinds in `ResourceKind`. */
export type ResourceKind = (typeof ResourceKind)[keyof typeof ResourceKind];

const BRUSH_SUFFIX = "Brush";
const MAX_SUGGESTIONS = 3;
const SUGGESTION_DISTANCE_SHARE = 0.25;
const MIN_SUGGESTION_DISTANCE = 3;

function isResourceKind(value: string): value is ResourceKind {
  return Object.values<string>(ResourceKind).includes(value);
}

// An alias stands for another resource, whose kind is not known here.
function isUsableAs({ candidate, kind }: {
  candidate: ResourceKind | undefined;
  kind: ResourceKind;
}) {
  return candidate === kind || candidate === ResourceKind.ALIAS;
}

/** "--card-background-fill-color-default" as "CardBackgroundFillColorDefault". */
export function resourceNameOf(customProperty: string) {
  return customProperty
    .replace(/^--/u, "")
    .split("-")
    .map(word => `${word.charAt(0).toUpperCase()}${word.slice(1)}`)
    .join("");
}

// "CardBackgroundFillColorDefault" as "--card-background-fill-color-default".
function customPropertyOf(resourceName: string) {
  const words = resourceName.replace(/([a-z0-9])([A-Z])/gu, "$1-$2").toLowerCase();
  return `--${words}`;
}

function editDistance({ from, to }: {
  from: string;
  to: string;
}) {
  let previous = Array.from({ length: to.length + 1 }, (_, index) => index);
  for (let row = 1; row <= from.length; row++) {
    const current = [row];
    for (let column = 1; column <= to.length; column++) {
      const cost = from[row - 1] === to[column - 1] ? 0 : 1;
      current.push(
        Math.min(
          (previous[column] ?? 0) + 1,
          (current[column - 1] ?? 0) + 1,
          (previous[column - 1] ?? 0) + cost
        )
      );
    }

    previous = current;
  }

  return previous[to.length] ?? 0;
}

/** The resources WinUI defines, and the ones a stylesheet adds. */
export interface ResourceCatalogue {
  kindOf(key: string): ResourceKind | undefined;
  /** The key spelled as WinUI spells it, found by its lower-case form. */
  keyOf(name: string): string | undefined;
  keysOfKind(kind: ResourceKind): string[];
  /** The nearest names to a mistyped one, as `--custom-properties`. */
  suggest(input: {
    name: string;
    kind: ResourceKind;
  }): string[];
  /** The same resources and some more, such as a stylesheet's own. */
  extend(more: ReadonlyMap<string, ResourceKind>): ResourceCatalogue;
}

/**
 * A catalogue over `groups` (a kind mapped to the keys of that kind) and
 * `extra`, which adds resources a stylesheet defines itself.
 */
export function createCatalogue({ groups, extra = new Map() }: {
  groups: Readonly<Record<string, readonly string[]>>;
  extra?: ReadonlyMap<string, ResourceKind>;
}) {
  const kinds = new Map<string, ResourceKind>();
  for (const [kind, keys] of Object.entries(groups)) {
    if (isResourceKind(kind)) {
      for (const key of keys) {
        kinds.set(key, kind);
      }
    }
  }

  for (const [key, kind] of extra) {
    kinds.set(key, kind);
  }

  const byLowerCase = new Map([...kinds.keys()].map(key => [key.toLowerCase(), key]));
  const catalogue: ResourceCatalogue = {
    extend: more => createCatalogue({
      groups,
      extra: new Map([...extra, ...more])
    }),
    kindOf: key => kinds.get(key),
    keyOf: name => byLowerCase.get(name.toLowerCase()),
    keysOfKind: kind => [...kinds].filter(([, candidate]) => isUsableAs({
      candidate,
      kind
    })).map(([key]) => key),
    suggest({ name, kind }) {
      const wanted = resourceNameOf(name).toLowerCase();
      const limit = Math.max(MIN_SUGGESTION_DISTANCE, Math.round(wanted.length * SUGGESTION_DISTANCE_SHARE));
      const isBrush = kind === ResourceKind.BRUSH;
      return [...kinds]
        .filter(([, candidate]) => isUsableAs({
          candidate,
          kind
        }))
        .map(([key]) => {
          const shown = isBrush ? key.replace(/Brush$/u, "") : key;
          return [shown, editDistance({
            from: shown.toLowerCase(),
            to: wanted
          })] as const;
        })
        .filter(([, distance]) => distance <= limit)
        .sort((first, second) => first[1] - second[1])
        .slice(0, MAX_SUGGESTIONS)
        .map(([shown]) => customPropertyOf(shown));
    }
  };
  return catalogue;
}

/** What looking up a `var()` found: the resource's key, or why there is none. */
export type VariableResolution =
  | {
    isFound: true;
    key: string;
  }
  | {
    isFound: false;
    reason: string;
  };

function describeSuggestions(suggestions: string[]) {
  return suggestions.length === 0 ? "" : `; did you mean ${suggestions.join(" or ")}?`;
}

/** The resource a `var(--name)` stands for where a value of `kind` is wanted. */
export function resolveVariable({ catalogue, name, kind }: {
  catalogue: ResourceCatalogue;
  name: string;
  kind: ResourceKind;
}) {
  const base = resourceNameOf(name);
  const candidates = kind === ResourceKind.BRUSH ? [`${base}${BRUSH_SUFFIX}`, base] : [base];
  for (const candidate of candidates) {
    const key = catalogue.keyOf(candidate);
    const found = key === undefined ? undefined : catalogue.kindOf(key);
    const isUsable = found === kind || found === ResourceKind.ALIAS;
    const isResolved = key !== undefined && isUsable;
    if (isResolved) {
      return {
        isFound: true,
        key
      } as const;
    }
  }

  const existing = candidates.map(candidate => catalogue.keyOf(candidate)).find(key => key !== undefined);
  const existingKind = existing === undefined ? undefined : catalogue.kindOf(existing);
  const isOtherKind = existing !== undefined && existingKind !== undefined;
  if (isOtherKind) {
    return {
      isFound: false,
      reason: `${name} is a WinUI ${existingKind} resource (${existing}), and a ${kind} is needed here`
    } as const;
  }

  const suggestions = describeSuggestions(
    catalogue.suggest({
      name,
      kind
    })
  );
  return {
    isFound: false,
    reason: `${name} is not a WinUI resource, nor a custom property this stylesheet declares${suggestions}`
  } as const;
}

/** Whether the catalogue has a style under this key. */
export function hasStyle({ catalogue, key }: {
  catalogue: ResourceCatalogue;
  key: string;
}) {
  const found = catalogue.keyOf(key);
  return found !== undefined && catalogue.kindOf(found) === ResourceKind.STYLE;
}
