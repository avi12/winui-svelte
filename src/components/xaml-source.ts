import { PRESENTATION_NAMESPACE, XAML_NAMESPACE } from "#src/css/translate/cascade.js";

// What a XAML string is checked for before XamlReader sees it: pure, so it is
// tested without WinUI. xaml.ts loads what passes.

/** What a XAML string is loaded as; its root element must be the kind's. */
export const XamlKind = {
  CONTROL_TEMPLATE: "controlTemplate",
  DATA_TEMPLATE: "dataTemplate",
  ITEMS_PANEL_TEMPLATE: "itemsPanelTemplate",
  STYLE: "style",
  RESOURCE_DICTIONARY: "resourceDictionary"
} as const;

/** A XAML kind: one of the `XamlKind` values. */
export type XamlKind = (typeof XamlKind)[keyof typeof XamlKind];

/** A XAML string and what it is to be loaded as. */
export interface XamlSource<Kind extends XamlKind = XamlKind> {
  kind: Kind;
  xaml: string;
}

const ROOT_ELEMENTS = new Map<XamlKind, string>([
  [XamlKind.CONTROL_TEMPLATE, "ControlTemplate"],
  [XamlKind.DATA_TEMPLATE, "DataTemplate"],
  [XamlKind.ITEMS_PANEL_TEMPLATE, "ItemsPanelTemplate"],
  [XamlKind.STYLE, "Style"],
  [XamlKind.RESOURCE_DICTIONARY, "ResourceDictionary"]
]);

const DEFAULT_NAMESPACE = "xmlns";
const KEYWORD_NAMESPACE = "xmlns:x";
// The text before the root's name (an XML declaration, comments), the name, and
// its attributes.
const ROOT_TAG =
  /^(\s*(?:<\?[\s\S]*?\?>\s*)?(?:<!--[\s\S]*?-->\s*)*<)([^\s/>!?]+)((?:\s+[^\s=/>]+\s*=\s*(?:"[^"]*"|'[^']*'))*)/u;
const ATTRIBUTE_NAME = /([^\s=]+)\s*=/gu;

function isXamlKind(kind: string): kind is XamlKind {
  return Object.values<string>(XamlKind).includes(kind);
}

// The root's namespace declarations the text lacks.
function missingNamespaces(attributes: string) {
  const names = new Set([...attributes.matchAll(ATTRIBUTE_NAME)].map(match => match[1]));
  const declarations = [
    [DEFAULT_NAMESPACE, PRESENTATION_NAMESPACE],
    [KEYWORD_NAMESPACE, XAML_NAMESPACE]
  ] as const;
  return declarations
    .filter(([name]) => !names.has(name))
    .map(([name, namespace]) => ` ${name}="${namespace}"`)
    .join("");
}

/**
 * The XAML, ready for XamlReader: it must be a string whose root element is
 * the kind's (`<ControlTemplate>` for a control template), and a root that
 * declares no namespace gets WinUI's (`xmlns`, and `xmlns:x` for `x:Key`), so
 * a template is written without them.
 *
 * @throws {RangeError} When the kind is none of `XamlKind`.
 * @throws {TypeError} When the text has no root element, or another than the kind's.
 */
export function loadableXaml({ kind, xaml }: XamlSource) {
  const isKnown = isXamlKind(kind);
  if (!isKnown) {
    throw new RangeError(`"${String(kind)}" is no XAML kind (${[...ROOT_ELEMENTS.keys()].join(", ")})`);
  }

  const root = typeof xaml === "string" ? ROOT_TAG.exec(xaml) : null;
  const hasRoot = root !== null;
  if (!hasRoot) {
    throw new TypeError(`a ${kind} is XAML text starting with <${ROOT_ELEMENTS.get(kind)}>`);
  }

  const [, before = "", name = "", attributes = ""] = root;
  const expected = ROOT_ELEMENTS.get(kind);
  const isRootOfKind = name === expected;
  if (!isRootOfKind) {
    throw new TypeError(`a ${kind} starts with <${expected}>, this XAML starts with <${name}>`);
  }

  const namespaces = missingNamespaces(attributes);
  const insertAt = before.length + name.length;
  return `${xaml.slice(0, insertAt)}${namespaces}${xaml.slice(insertAt)}`;
}
