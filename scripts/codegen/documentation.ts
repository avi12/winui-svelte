import { existsSync, readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { z } from "zod";

// WinUI's own documentation, read from the XML that ships beside a winmd
// (Microsoft.UI.Xaml.xml): one entry for each type, property and event,
// turned into the plain text of a JSDoc comment. What the XML lacks comes from
// documentation-fallback.json, which fetch-documentation.ts wrote by hand from
// Microsoft's published reference. Build tooling only: neither reaches an app.

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
// Documented kinds: T type, P property, E event, M method (an attached
// property's getter says what the property is).
const KINDS = new Set(["T", "P", "E", "M"]);
const PROJECTION_XML = "Microsoft.WinUI.xml";
const GETTER_PREFIX = "Get";
const IDENTIFIER_SUFFIX = "Property";
const IDENTIFIES = "Identifies ";
// The documentation of an attached property is the owner's `GetLeft`
// ("Gets the value of the Canvas.Left XAML attached property ...").
const GETS_PATTERN = /^Gets\b/;
const MEMBER_ID_PATTERN = /^[TPEM]:[A-Za-z0-9_.]+$/;

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
    const signature = name?.slice(2) ?? "";
    const parameters = signature.indexOf("(");
    const id = parameters < 0 ? signature : signature.slice(0, parameters);
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

/**
 * The text of an attached property from its owner's documentation: the
 * getter's summary as "Gets or sets ...", else the identifier's ("Identifies
 * the Canvas.Left XAML attached property" as "Gets or sets the Canvas.Left
 * XAML attached property").
 */
export function attachedText({ documentation, name }: {
  documentation: TypeDocumentation | undefined;
  name: string;
}) {
  const getter = documentation?.members.get(`M:${GETTER_PREFIX}${name}`);
  const hasGetter = getter !== undefined;
  if (hasGetter) {
    return getter.replace(GETS_PATTERN, GETS_OR_SETS);
  }

  const identifier = documentation?.members.get(`P:${name}${IDENTIFIER_SUFFIX}`);
  const isIdentifier = identifier?.startsWith(IDENTIFIES) === true;
  if (isIdentifier) {
    return `${GETS_OR_SETS} ${identifier.slice(IDENTIFIES.length)}`;
  }

  return identifier ?? documentation?.members.get(`P:${name}`);
}

/**
 * The XML files that document a winmd, the least specific first: the managed
 * projection's of the same NuGet package (`lib/<framework>/Microsoft.WinUI.xml`
 * documents members the winmd's own XML lacks), then the winmd's own, beside
 * it or in the `en` folder the Windows SDK keeps its reference XML in.
 */
export function documentationAround(winmd: string) {
  const folder = path.dirname(winmd);
  const name = `${path.basename(winmd, ".winmd")}.xml`;
  const library = path.join(folder, "..", "lib");
  const projections = existsSync(library) ? readdirSync(library).sort() : [];
  const candidates = [
    ...projections.map(framework => path.join(library, framework, PROJECTION_XML)),
    path.join(folder, "en", name),
    path.join(folder, name)
  ];
  return candidates.filter(file => existsSync(file));
}

function mergeInto({ target, source }: {
  target: Map<string, TypeDocumentation>;
  source: ReadonlyMap<string, TypeDocumentation>;
}) {
  for (const [name, documentation] of source) {
    const known = target.get(name);
    target.set(name, {
      summary: documentation.summary ?? known?.summary ?? null,
      members: new Map([...known?.members ?? [], ...documentation.members])
    });
  }
}

const COMMIT_PATTERN = /^[0-9a-f]{40}$/;

const fallbackSourceSchema = z.object({
  name: z.string(),
  repository: z.string(),
  branch: z.string(),
  commit: z.string().regex(COMMIT_PATTERN),
  license: z.string(),
  licenseUrl: z.string()
});

/** Where the text of documentation-fallback.json was read from, pinned to a commit. */
export type FallbackSource = z.infer<typeof fallbackSourceSchema>;

/** The shape of documentation-fallback.json: its sources, and the text by member id. */
export const fallbackSchema = z.object({
  sources: z.array(fallbackSourceSchema),
  members: z.record(z.string().regex(MEMBER_ID_PATTERN), z.string().min(1))
});

/**
 * What documentation-fallback.json holds, by the type's full name: the
 * members the XML lacks, each under its id (`P:Namespace.Type.Name`).
 */
export function loadFallback(file: string) {
  const parsed = fallbackSchema.parse(JSON.parse(readFileSync(file, "utf8")));
  const types = new Map<string, {
    summary: string | null;
    members: Map<string, string>;
  }>();
  for (const [id, text] of Object.entries(parsed.members)) {
    const split = id.lastIndexOf(".");
    const isType = id.startsWith("T:");
    const typeName = isType ? id.slice(2) : id.slice(2, split);
    const known = types.get(typeName) ?? {
      summary: null,
      members: new Map<string, string>()
    };
    if (isType) {
      known.summary = text;
    } else {
      known.members.set(`${id.slice(0, 1)}:${id.slice(split + 1)}`, text);
    }

    types.set(typeName, known);
  }

  return types;
}

/**
 * The documentation of the files merged member by member: the fallback first
 * and the XML files after it, each later source winning where it speaks.
 */
export function loadDocumentation({ files, fallback }: {
  files: readonly string[];
  fallback: ReadonlyMap<string, TypeDocumentation>;
}) {
  const merged = new Map<string, TypeDocumentation>();
  mergeInto({
    target: merged,
    source: fallback
  });
  for (const file of files) {
    mergeInto({
      target: merged,
      source: parseDocumentation(readFileSync(file, "utf8"))
    });
  }

  return merged;
}
