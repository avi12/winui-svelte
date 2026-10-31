import type { ResourceCatalogue } from "#src/css/runtime/resources.js";
import { ResourceKind, resourceNameOf } from "#src/css/runtime/resources.js";
import { ColorScheme } from "#src/css/translate/types.js";
import { aliasEntries, entriesForKey, resourceDictionaryXaml } from "#src/css/translate/variables.js";

// A record of resources (the `resources` prop) split into the part XAML says
// and the part is handed to the dictionary as it is. Pure: the catalogue is
// WinUI's resource names and kinds, the same the CSS custom properties read, so
// a key WinUI defines keeps its kind (`ButtonBackground` is a brush however it
// is written). A key is a custom property's name (`--button-background`, as in
// a stylesheet) or the resource's own (`ButtonBackground`).

/**
 * What a resource can be given as: a color (any CSS color text), a length (a
 * number, or text in `px`; a Thickness or CornerRadius key takes one length for
 * every side), text, a boolean, or a WinRT object (a brush, a style) as it is.
 */
export type ResourceValueInput = string | number | boolean | object;

/**
 * Resources by key: a custom property's name (`"--button-background"`) or the
 * resource's own (`ButtonBackground`), WinUI's theme resources or the app's.
 */
export type ResourceRecordInput = Readonly<Record<string, ResourceValueInput>>;

/** A resource that goes into the dictionary as the value it is, not as XAML. */
export interface DirectResource {
  key: string;
  /** What WinUI calls the key, or undefined for a key of the app's. */
  kind: ResourceKind | undefined;
  value: string | boolean | object;
}

const CUSTOM_PROPERTY_PREFIX = "--";

// What text may be, besides a color or a length, for a key of this kind.
const TEXT_KINDS: ReadonlySet<ResourceKind | undefined> = new Set([
  undefined,
  ResourceKind.STRING,
  ResourceKind.FONT_FAMILY
]);

function mismatch({ key, kind, reason }: {
  key: string;
  kind: ResourceKind | undefined;
  reason: string;
}) {
  const known = kind === undefined ? "" : ` (a WinUI ${kind})`;
  return new TypeError(`resources.${key}${known}: ${reason}`);
}

function directOf({ key, kind, value }: {
  key: string;
  kind: ResourceKind | undefined;
  value: ResourceValueInput;
}) {
  const isText = typeof value === "string" && TEXT_KINDS.has(kind);
  const isFlag = typeof value === "boolean" && (kind === undefined || kind === ResourceKind.BOOLEAN);
  const isObject = typeof value === "object";
  const isDirect = isText || isFlag || isObject;
  return isDirect ? {
    key,
    kind,
    value
  } : null;
}

// A color or a length makes XAML (a Brush key a SolidColorBrush, a Thickness key
// a Thickness); text for a key that takes text, or a key WinUI does not know,
// goes in as it is.
function partOf({ catalogue, key, value }: {
  catalogue: ResourceCatalogue;
  key: string;
  value: ResourceValueInput;
}) {
  const kind = catalogue.kindOf(key);
  const problems: string[] = [];
  const isLengthOrText = typeof value === "string" || typeof value === "number";
  const entries = isLengthOrText ? entriesForKey({
    variable: {
      name: key,
      value: String(value),
      scheme: ColorScheme.DEFAULT
    },
    key,
    catalogue,
    reportProblem: message => problems.push(message)
  }) : [];
  const hasEntries = entries.length > 0;
  const direct = hasEntries ? null : directOf({
    key,
    kind,
    value
  });
  const isUnderstood = hasEntries || direct !== null;
  if (!isUnderstood) {
    throw mismatch({
      key,
      kind,
      reason: problems.join("; ") || `${String(value)} is not a value this key takes`
    });
  }

  return {
    entries,
    direct
  };
}

/**
 * Splits a record into the XAML of a ResourceDictionary (its colors and
 * lengths, in the default theme dictionary) and the resources it holds as they
 * are.
 *
 * @throws {TypeError} When a value is not the kind its key has in WinUI.
 */
export function resourceParts({ record, catalogue }: {
  record: ResourceRecordInput;
  catalogue: ResourceCatalogue;
}) {
  const parts = Object.entries(record).map(([written, value]) => {
    const isCustomProperty = written.startsWith(CUSTOM_PROPERTY_PREFIX);
    const name = isCustomProperty ? resourceNameOf(written) : written;
    return partOf({
      catalogue,
      key: catalogue.keyOf(name) ?? name,
      value
    });
  });
  const entries = parts.flatMap(part => part.entries);
  const hasEntries = entries.length > 0;
  return {
    xaml: hasEntries ? resourceDictionaryXaml([...entries, ...aliasEntries({
      entries,
      catalogue
    })]) : null,
    direct: parts.flatMap(part => part.direct === null ? [] : [part.direct])
  };
}
