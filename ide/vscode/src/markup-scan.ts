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

function scanTag({ text, tag, start, found }: {
  text: string;
  tag: string;
  start: number;
  found: AttributeValue[];
}) {
  let cursor = skipBlank({
    text,
    start
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

    cursor = skipBlank({
      text,
      start: cursor + name[0].length
    });
    const hasValue = text.charAt(cursor) === "=";
    if (!hasValue) {
      continue;
    }

    cursor = skipBlank({
      text,
      start: cursor + 1
    });
    const quote = text.charAt(cursor);
    if (QUOTES.has(quote)) {
      const valueEnd = text.indexOf(quote, cursor + 1);
      const isClosed = valueEnd !== -1;
      if (isClosed) {
        found.push({
          tag,
          attribute: name[0],
          value: text.slice(cursor + 1, valueEnd),
          valueStart: cursor + 1,
          valueEnd
        });
      }

      cursor = skipBlank({
        text,
        start: isClosed ? valueEnd + 1 : text.length
      });
      continue;
    }

    const isExpression = quote === "{";
    const valueEnd = isExpression ? skipBraces({
      text,
      start: cursor
    }) : cursor + (/[^\s>]*/u.exec(text.slice(cursor))?.[0].length ?? 0);
    cursor = skipBlank({
      text,
      start: valueEnd
    });
  }

  return cursor;
}

/**
 * Every attribute with a quoted value in the tags of a Svelte file, with where the value sits, skipping
 * the contents of `script` and `style`.
 */
export function scanAttributes(text: string) {
  const found: AttributeValue[] = [];
  let cursor = text.indexOf("<");
  while (cursor !== -1 && cursor < text.length) {
    TAG_START.lastIndex = cursor;
    const match = TAG_START.exec(text);
    const isTag = match !== null && match[1] !== undefined;
    if (!isTag) {
      cursor = text.indexOf("<", cursor + 1);
      continue;
    }

    const tag = match[1] ?? "";
    const isRawText = RAW_TEXT_TAGS.has(tag.toLowerCase());
    const afterTag = scanTag({
      text,
      tag,
      start: cursor + match[0].length,
      found
    });
    const closing = isRawText ? text.indexOf(`</${tag}`, afterTag) : afterTag;
    cursor = text.indexOf("<", closing === -1 ? text.length : closing);
  }

  return found;
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
