export const DeclarationSource = {
  RULE: "rule",
  STYLE: "style",
  DIRECTIVE: "directive",
  ATTRIBUTE: "attribute"
} as const;
export type DeclarationSource = (typeof DeclarationSource)[keyof typeof DeclarationSource];

export interface CssDeclaration {
  property: string;
  value: string;
  start: number;
  valueStart: number;
  valueEnd: number;
  group: number;
  source: DeclarationSource;
  selector: string;
  media: string[];
}

interface Block {
  isRule: boolean;
  media: string[];
  selector: string;
  key: string;
}

const STYLE_BLOCK = /<style\b[^>]*>([\s\S]*?)<\/style>/giu;
const SCRIPT_BLOCK = /<script\b[^>]*>[\s\S]*?<\/script>/giu;
const TAG = /<([A-Za-z][\w.:-]*)((?:"[^"]*"|'[^']*'|\{[^}]*\}|[^>"'{])*)>/gu;
const STYLE_ATTRIBUTE = /(?<=\s)style=(["'])([^"']*)\1/gu;
const DIRECTIVE_ATTRIBUTE = /(?<=\s)style:(?<name>[\w-]+)=(["'])(?<value>[^"']*)\2/gu;
const LITERAL_ATTRIBUTE = /(?<=\s)(?<name>[A-Za-z][\w-]*)=(["'])(?<value>[^"']*)\2/gu;
const COMMENT = /\/\*[\s\S]*?\*\//gu;
const MEDIA_PREFIX = "@media";
const AT_PREFIX = "@";
const IMPORTANT = /\s*!important\s*$/iu;
const BLANK = " ";
const STYLE_EQUALS = "style=";
const EXTRA_ATTRIBUTES = new Map([
  ["backdrop", "backdrop"],
  ["keySpline", "key-spline"],
  ["columns", "grid-template-columns"],
  ["rows", "grid-template-rows"]
]);

type Groups = Map<string, number>;

function groupOf({ groups, key }: {
  groups: Groups;
  key: string;
}) {
  const known = groups.get(key);
  const isKnown = known !== undefined;
  if (isKnown) {
    return known;
  }

  groups.set(key, groups.size);
  return groups.size - 1;
}

function declarationOf({ statement, offset, block, groups }: {
  statement: string;
  offset: number;
  block: Block;
  groups: Groups;
}) {
  const colon = statement.indexOf(":");
  const rawValue = statement.slice(colon + 1).replace(IMPORTANT, "");
  const leading = rawValue.length - rawValue.trimStart().length;
  const value = rawValue.trim();
  const isDeclaration = colon !== -1 && value !== "";
  if (!isDeclaration) {
    return [];
  }

  const valueStart = offset + colon + 1 + leading;
  return [{
    property: statement.slice(0, colon).trim().toLowerCase(),
    value,
    start: offset + statement.length - statement.trimStart().length,
    valueStart,
    valueEnd: valueStart + value.length,
    group: groupOf({
      groups,
      key: block.key
    }),
    source: DeclarationSource.RULE,
    selector: block.selector,
    media: block.media
  } satisfies CssDeclaration];
}

function blockOf({ prelude, parent, key }: {
  prelude: string;
  parent: Block | undefined;
  key: string;
}) {
  const inherited = parent?.media ?? [];
  const isMedia = prelude.toLowerCase().startsWith(MEDIA_PREFIX);
  if (isMedia) {
    return {
      isRule: false,
      media: [...inherited, prelude.slice(MEDIA_PREFIX.length).trim()],
      selector: "",
      key
    } satisfies Block;
  }

  return {
    isRule: !prelude.startsWith(AT_PREFIX),
    media: inherited,
    selector: prelude,
    key
  } satisfies Block;
}

function scanStyleBody({ body, base, groups }: {
  body: string;
  base: number;
  groups: Groups;
}) {
  const text = body.replaceAll(COMMENT, comment => BLANK.repeat(comment.length));
  const stack: Block[] = [];
  const found: CssDeclaration[] = [];
  let statementStart = 0;
  let parentheses = 0;
  for (const [i, char] of text.split("").entries()) {
    parentheses += Number(char === "(") - Number(char === ")");
    const isBoundary = parentheses <= 0 && (char === "{" || char === "}" || char === ";");
    if (!isBoundary) {
      continue;
    }

    const statement = text.slice(statementStart, i);
    const parent = stack.at(-1);
    const isOpening = char === "{";
    if (isOpening) {
      stack.push(
        blockOf({
          prelude: statement.trim(),
          parent,
          key: `${base}:${statementStart}`
        })
      );
    }

    const isDeclaration = !isOpening && parent?.isRule === true;
    if (isDeclaration) {
      found.push(
        ...declarationOf({
          statement,
          offset: base + statementStart,
          block: parent,
          groups
        })
      );
    }

    const isClosing = char === "}";
    if (isClosing) {
      stack.pop();
    }

    statementStart = i + 1;
  }

  return found;
}

function styleAttributeDeclarations({ value, base, key, groups }: {
  value: string;
  base: number;
  key: string;
  groups: Groups;
}) {
  const block = {
    isRule: true,
    media: [],
    selector: "",
    key
  } satisfies Block;
  let cursor = 0;
  return value.split(";").flatMap(statement => {
    const offset = base + cursor;
    cursor += statement.length + 1;
    return declarationOf({
      statement,
      offset,
      block,
      groups
    }).map(declaration => ({
      ...declaration,
      source: DeclarationSource.STYLE
    }));
  });
}

function singleDeclaration({ property, value, base, key, source, groups }: {
  property: string;
  value: string;
  base: number;
  key: string;
  source: DeclarationSource;
  groups: Groups;
}) {
  return {
    property,
    value,
    start: base,
    valueStart: base,
    valueEnd: base + value.length,
    group: groupOf({
      groups,
      key
    }),
    source,
    selector: "",
    media: []
  } satisfies CssDeclaration;
}

function tagDeclarations({ tag, attributeProperties, groups }: {
  tag: RegExpExecArray;
  attributeProperties: ReadonlyMap<string, string>;
  groups: Groups;
}) {
  const [whole = "", name = "", attributes = ""] = tag;
  const base = tag.index + whole.indexOf(attributes, name.length);
  const key = `tag:${tag.index}`;
  const fromStyle = [...attributes.matchAll(STYLE_ATTRIBUTE)].flatMap(match => styleAttributeDeclarations({
    value: match[2] ?? "",
    base: base + match.index + STYLE_EQUALS.length + 1,
    key,
    groups
  }));
  const fromDirectives = [...attributes.matchAll(DIRECTIVE_ATTRIBUTE)].map(match => singleDeclaration({
    property: (match.groups?.["name"] ?? "").toLowerCase(),
    value: match.groups?.["value"] ?? "",
    base: base + match.index + match[0].lastIndexOf(match.groups?.["value"] ?? ""),
    key,
    source: DeclarationSource.DIRECTIVE,
    groups
  }));
  const fromProps = [...attributes.matchAll(LITERAL_ATTRIBUTE)].flatMap(match => {
    const name = match.groups?.["name"] ?? "";
    const value = match.groups?.["value"] ?? "";
    const property = attributeProperties.get(name) ?? EXTRA_ATTRIBUTES.get(name);
    return property === undefined ? [] : [singleDeclaration({
      property,
      value,
      base: base + match.index + match[0].lastIndexOf(value),
      key,
      source: DeclarationSource.ATTRIBUTE,
      groups
    })];
  });
  return [...fromStyle, ...fromDirectives, ...fromProps];
}

/**
 * Every CSS declaration a Svelte file writes, in order: the rules of its `<style>` block (with the `@media`
 * conditions around each), the declarations of `style="..."`, the `style:property="..."` directives and the props
 * whose CSS counterpart the lookup names. Declarations of one rule or one tag share a `group`, numbered from 0 in
 * the order the groups first appear.
 */
export function cssDeclarationsOf({ text, attributeProperties }: {
  text: string;
  attributeProperties: ReadonlyMap<string, string>;
}) {
  const groups: Groups = new Map();
  const fromStyles = [...text.matchAll(STYLE_BLOCK)].flatMap(block => scanStyleBody({
    body: block[1] ?? "",
    base: block.index + block[0].indexOf(">") + 1,
    groups
  }));
  const markup = text
    .replaceAll(STYLE_BLOCK, block => BLANK.repeat(block.length))
    .replaceAll(SCRIPT_BLOCK, block => BLANK.repeat(block.length));
  const fromTags = [...markup.matchAll(TAG)].flatMap(tag => tagDeclarations({
    tag,
    attributeProperties,
    groups
  }));
  const order = new Map<number, number>();
  return [...fromStyles, ...fromTags].toSorted((left, right) => left.start - right.start).map(declaration => {
    const isNewGroup = !order.has(declaration.group);
    if (isNewGroup) {
      order.set(declaration.group, order.size);
    }

    return {
      ...declaration,
      group: order.get(declaration.group) ?? 0
    };
  });
}

export interface MediaQuery {
  condition: string;
  start: number;
  end: number;
}

const MEDIA_RULE = /@media\s+(?<condition>[^{;]+?)\s*\{/giu;

/**
 * The condition of every `@media` rule in the `<style>` blocks of a Svelte file, with its range.
 */
export function mediaQueriesOf(text: string) {
  return [...text.matchAll(STYLE_BLOCK)].flatMap(block => {
    const body = (block[1] ?? "").replaceAll(COMMENT, comment => BLANK.repeat(comment.length));
    const base = block.index + block[0].indexOf(">") + 1;
    return [...body.matchAll(MEDIA_RULE)].map(match => {
      const condition = match.groups?.["condition"] ?? "";
      const start = base + match.index + match[0].indexOf(condition);
      return {
        condition,
        start,
        end: start + condition.length
      } satisfies MediaQuery;
    });
  });
}
