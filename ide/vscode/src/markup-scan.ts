export const ValueKind = {
  QUOTED: "quoted",
  EXPRESSION: "expression",
  BARE: "bare"
} as const;
export type ValueKind = (typeof ValueKind)[keyof typeof ValueKind];

export interface ValueNode {
  kind: ValueKind;
  start: number;
  end: number;
  text: string;
}

export interface AttributeNode {
  name: string;
  start: number;
  end: number;
  value: ValueNode | undefined;
}

export interface TagNode {
  name: string;
  start: number;
  nameEnd: number;
  attributes: AttributeNode[];
}

export interface AttributeValue {
  tag: string;
  attribute: string;
  value: string;
  valueStart: number;
  valueEnd: number;
}

const QUOTES = new Set(["\"", "'"]);
const RAW_TEXT_TAGS = new Set(["script", "style"]);
const TAG_START = /<([A-Za-z][\w.:-]*)/y;
const ATTRIBUTE_NAME = /[^\s=/>{]+/y;
const BARE_VALUE = /[^\s>]*/y;
const IMPORT = /import\s+(\w+)\s+from\s+["']([^"']+\.svelte)["']/g;

function skipBraces({ text, start }: {
  text: string;
  start: number;
}) {
  let depth = 0;
  let quote = "";
  for (let i = start; i < text.length; i += 1) {
    const char = text.charAt(i);
    const isQuoted = quote !== "";
    if (isQuoted) {
      const isEscape = char === "\\";
      i += isEscape ? 1 : 0;
      quote = char === quote ? "" : quote;
      continue;
    }

    const isQuote = QUOTES.has(char) || char === "`";
    quote = isQuote ? char : "";
    depth += char === "{" ? 1 : 0;
    depth -= char === "}" ? 1 : 0;
    const isClosed = !isQuote && depth === 0;
    if (isClosed) {
      return i + 1;
    }
  }

  return text.length;
}

function skipBlank({ text, start }: {
  text: string;
  start: number;
}) {
  let cursor = start;
  while (cursor < text.length && /\s/u.test(text.charAt(cursor))) {
    cursor += 1;
  }

  return cursor;
}

function scanValue({ text, start }: {
  text: string;
  start: number;
}) {
  const first = text.charAt(start);
  if (QUOTES.has(first)) {
    const closing = text.indexOf(first, start + 1);
    const end = closing === -1 ? text.length : closing + 1;
    return {
      kind: ValueKind.QUOTED,
      start,
      end,
      text: text.slice(start, end)
    };
  }

  const isExpression = first === "{";
  if (isExpression) {
    const end = skipBraces({
      text,
      start
    });
    return {
      kind: ValueKind.EXPRESSION,
      start,
      end,
      text: text.slice(start, end)
    };
  }

  BARE_VALUE.lastIndex = start;
  const end = start + (BARE_VALUE.exec(text)?.[0].length ?? 0);
  return {
    kind: ValueKind.BARE,
    start,
    end,
    text: text.slice(start, end)
  };
}

function scanTag({ text, tag }: {
  text: string;
  tag: TagNode;
}) {
  let cursor = skipBlank({
    text,
    start: tag.nameEnd
  });
  while (cursor < text.length) {
    const char = text.charAt(cursor);
    const isEnd = char === ">" || (char === "/" && text.charAt(cursor + 1) === ">");
    if (isEnd) {
      return cursor + 1;
    }

    const isBrace = char === "{";
    if (isBrace) {
      cursor = skipBlank({
        text,
        start: skipBraces({
          text,
          start: cursor
        })
      });
      continue;
    }

    ATTRIBUTE_NAME.lastIndex = cursor;
    const name = ATTRIBUTE_NAME.exec(text);
    const hasNoName = name === null;
    if (hasNoName) {
      cursor += 1;
      continue;
    }

    const attributeStart = cursor;
    const nameEnd = cursor + name[0].length;
    cursor = skipBlank({
      text,
      start: nameEnd
    });
    const hasValue = text.charAt(cursor) === "=";
    if (!hasValue) {
      tag.attributes.push({
        name: name[0],
        start: attributeStart,
        end: nameEnd,
        value: undefined
      });
      continue;
    }

    const value = scanValue({
      text,
      start: skipBlank({
        text,
        start: cursor + 1
      })
    });
    tag.attributes.push({
      name: name[0],
      start: attributeStart,
      end: value.end,
      value
    });
    cursor = skipBlank({
      text,
      start: value.end
    });
  }

  return cursor;
}

/**
 * Every tag of a Svelte file with its attributes and where each sits, skipping the contents of `script` and `style`.
 */
export function scanTags(text: string) {
  const tags: TagNode[] = [];
  let cursor = text.indexOf("<");
  while (cursor !== -1 && cursor < text.length) {
    TAG_START.lastIndex = cursor;
    const match = TAG_START.exec(text);
    const isTag = match !== null && match[1] !== undefined;
    if (!isTag) {
      cursor = text.indexOf("<", cursor + 1);
      continue;
    }

    const name = match[1] ?? "";
    const tag: TagNode = {
      name,
      start: cursor,
      nameEnd: cursor + match[0].length,
      attributes: []
    };
    tags.push(tag);
    const afterTag = scanTag({
      text,
      tag
    });
    const isRawText = RAW_TEXT_TAGS.has(name.toLowerCase());
    const closing = isRawText ? text.indexOf(`</${name}`, afterTag) : afterTag;
    cursor = text.indexOf("<", closing === -1 ? text.length : closing);
  }

  return tags;
}

/**
 * Every attribute with a quoted value in the tags of a Svelte file, with where the value sits.
 */
export function scanAttributes(text: string) {
  return scanTags(text).flatMap(tag => tag.attributes.flatMap(attribute => {
    const { value } = attribute;
    const isClosed = value?.kind === ValueKind.QUOTED && value.text.length >= 2;
    const isQuoted = isClosed && value.text.endsWith(value.text.charAt(0));
    return isQuoted ? [{
      tag: tag.name,
      attribute: attribute.name,
      value: value.text.slice(1, -1),
      valueStart: value.start + 1,
      valueEnd: value.end - 1
    } satisfies AttributeValue] : [];
  }));
}

/**
 * Whether the source of a component declares the prop with the given input type (`GlyphInput`).
 */
export function declaresAsInputType({ source, prop, inputType }: {
  source: string;
  prop: string;
  inputType: string;
}) {
  const escaped = prop.replaceAll(/[.*+?^${}()|[\]\\]/gu, "\\$&");
  return new RegExp(`\\b${escaped}\\??\\s*:\\s*${inputType}\\b`, "u").test(source);
}

/**
 * The `.svelte` files a Svelte file imports, by the name each is imported as.
 */
export function importedComponents(text: string) {
  return new Map([...text.matchAll(IMPORT)].map(([, name, path]) => [name ?? "", path ?? ""]));
}
