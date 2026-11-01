import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

// WinUI's own documentation, read from the XML that ships beside a winmd
// (Microsoft.UI.Xaml.xml): one entry for each type, property and event,
// turned into the plain text of a JSDoc comment. Build tooling only: the XML
// never reaches an app.

const MEMBER_PATTERN = /<member name="([^"]+)">([\s\S]*?)<\/member>/g;
const SUMMARY_PATTERN = /<summary>([\s\S]*?)<\/summary>/;
const RETURNS_PATTERN = /<returns>([\s\S]*?)<\/returns>/;
const CROSS_REFERENCE_PATTERN = /<(?:see|seealso)\s+cref="([^"]+)"\s*\/>/g;
const PARAMETER_REFERENCE_PATTERN = /<paramref\s+name="([^"]+)"\s*\/>/g;
const CODE_PATTERN = /<c>([\s\S]*?)<\/c>/g;
const TAG_PATTERN = /<[^>]+>/g;
const NUMERIC_ENTITY_PATTERN = /&#(x?)([0-9a-fA-F]+);/g;
const WORD_PATTERN = /[a-z0-9]+/g;
// "true if the icon is shown; otherwise, false": a boolean's returns only
// restates its summary.
const BOOLEAN_RETURNS_PATTERN = /^true\b/i;
const GETS_OR_SETS = "Gets or sets";
const GETS = "Gets";
// The share of the returns' words the summary already says, from which the
// returns is a repeat.
const REPEATED_SHARE = 0.8;
const HEX_RADIX = 16;
const DECIMAL_RADIX = 10;
const ENTITIES = new Map([
  ["&lt;", "<"],
  ["&gt;", ">"],
  ["&quot;", "\""],
  ["&apos;", "'"]
]);
// Documented kinds: T type, P property, E event.
const KINDS = new Set(["T", "P", "E"]);

/** What the documentation says about a type and its members. */
export interface TypeDocumentation {
  summary: string | null;
  /** By kind and name: `P:Glyph`, `E:Click`. */
  members: ReadonlyMap<string, string>;
}

function lastSegment(reference: string) {
  const name = reference.slice(reference.indexOf(":") + 1);
  return name.slice(name.lastIndexOf(".") + 1);
}

function decoded(text: string) {
  const named = text.replace(/&(?:lt|gt|quot|apos);/g, entity => ENTITIES.get(entity) ?? entity);
  const numeric = named.replace(NUMERIC_ENTITY_PATTERN, (_match, hex: string, digits: string) =>
    String.fromCodePoint(Number.parseInt(digits, hex === "x" ? HEX_RADIX : DECIMAL_RADIX)));
  return numeric.replaceAll("&amp;", "&");
}

/**
 * The XML of one summary or returns as the text of a JSDoc comment: tags
 * dropped (a cross reference keeps its last name, code goes in backticks),
 * entities decoded, white space collapsed, and nothing that ends the comment.
 */
export function plainText(xml: string) {
  return decoded(
    xml
      .replace(CROSS_REFERENCE_PATTERN, (_match, reference: string) => lastSegment(reference))
      .replace(PARAMETER_REFERENCE_PATTERN, (_match, name: string) => name)
      .replace(CODE_PATTERN, (_match, code: string) => `\`${code}\``)
      .replace(TAG_PATTERN, " ")
  )
    .replace(/\s+/g, " ")
    .trim()
    .replaceAll("*/", "*\\/")
    .replaceAll("@", "\\@");
}

function wordsOf(text: string) {
  return text.toLowerCase().match(WORD_PATTERN) ?? [];
}

function isRepeat({ summary, returns }: {
  summary: string;
  returns: string;
}) {
  if (BOOLEAN_RETURNS_PATTERN.test(returns)) {
    return true;
  }

  const known = new Set(wordsOf(summary));
  const words = wordsOf(returns);
  const sharedCount = words.filter(word => known.has(word)).length;
  return sharedCount >= words.length * REPEATED_SHARE;
}

/**
 * A member's text: the summary; when that only says "Gets or sets ..." and
 * the returns adds something, the returns' sentence after it.
 */
export function memberText({ summary, returns }: {
  summary: string;
  returns: string | null;
}) {
  const isAccessor = summary.startsWith(GETS_OR_SETS) || summary.startsWith(GETS);
  const hasReturns = returns !== null && returns !== "";
  const isAdded = isAccessor && hasReturns && !isRepeat({
    summary,
    returns
  });
  return isAdded ? `${summary} ${returns}` : summary;
}

function entryOf(body: string) {
  const summary = SUMMARY_PATTERN.exec(body)?.[1];
  const isSummarized = summary !== undefined;
  if (!isSummarized) {
    return null;
  }

  const returns = RETURNS_PATTERN.exec(body)?.[1];
  const text = memberText({
    summary: plainText(summary),
    returns: returns === undefined ? null : plainText(returns)
  });
  return text === "" ? null : text;
}

/** The documentation of every type in the XML files, by the type's full name. */
export function parseDocumentation(xml: string) {
  const types = new Map<string, {
    summary: string | null;
    members: Map<string, string>;
  }>();
  function typeOf(fullName: string) {
    const known = types.get(fullName);
    const isKnown = known !== undefined;
    if (isKnown) {
      return known;
    }

    const created = {
      summary: null,
      members: new Map<string, string>()
    };
    types.set(fullName, created);
    return created;
  }

  for (const [, name, body] of xml.matchAll(MEMBER_PATTERN)) {
    const kind = name?.slice(0, 1) ?? "";
    const id = name?.slice(2) ?? "";
    const isDocumented = KINDS.has(kind) && body !== undefined;
    const text = isDocumented ? entryOf(body) : null;
    const isEmpty = text === null;
    if (isEmpty) {
      continue;
    }

    const isType = kind === "T";
    if (isType) {
      typeOf(id).summary = text;
      continue;
    }

    const split = id.lastIndexOf(".");
    typeOf(id.slice(0, split)).members.set(`${kind}:${id.slice(split + 1)}`, text);
  }

  return types;
}

/** The XML that ships beside a winmd, when there is one. */
export function documentationBeside(winmd: string) {
  const file = path.join(path.dirname(winmd), `${path.basename(winmd, ".winmd")}.xml`);
  return existsSync(file) ? file : null;
}

/** The documentation of the XML files merged, later files adding to earlier. */
export function loadDocumentation(files: readonly string[]) {
  const merged = new Map<string, TypeDocumentation>();
  for (const file of files) {
    for (const [name, documentation] of parseDocumentation(readFileSync(file, "utf8"))) {
      merged.set(name, documentation);
    }
  }

  return merged;
}
