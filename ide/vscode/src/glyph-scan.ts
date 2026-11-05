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
  let at = start;
  while (at < text.length && /\s/u.test(text.charAt(at))) {
    at += 1;
  }

  return at;
}

function scanTag({ text, tag, start, found }: {
  text: string;
  tag: string;
  start: number;
  found: AttributeValue[];
}) {
  let at = skipBlank({
    text,
    start
  });
  while (at < text.length) {
    const char = text.charAt(at);
    const isEnd = char === ">" || (char === "/" && text.charAt(at + 1) === ">");
    if (isEnd) {
      return at + 1;
    }

    if (char === "{") {
      at = skipBlank({
        text,
        start: skipBraces({
          text,
          start: at
        })
      });
      continue;
    }

    ATTRIBUTE_NAME.lastIndex = at;
    const name = ATTRIBUTE_NAME.exec(text);
    if (name === null) {
      at += 1;
      continue;
    }

    at = skipBlank({
      text,
      start: at + name[0].length
    });
    const hasValue = text.charAt(at) === "=";
    if (!hasValue) {
      continue;
    }

    at = skipBlank({
      text,
      start: at + 1
    });
    const quote = text.charAt(at);
    if (QUOTES.has(quote)) {
      const valueEnd = text.indexOf(quote, at + 1);
      const isClosed = valueEnd !== -1;
      if (isClosed) {
        found.push({
          tag,
          attribute: name[0],
          value: text.slice(at + 1, valueEnd),
          valueStart: at + 1,
          valueEnd
        });
      }

      at = skipBlank({
        text,
        start: isClosed ? valueEnd + 1 : text.length
      });
      continue;
    }

    const isExpression = quote === "{";
    const valueEnd = isExpression ? skipBraces({
      text,
      start: at
    }) : at + (/[^\s>]*/u.exec(text.slice(at))?.[0].length ?? 0);
    at = skipBlank({
      text,
      start: valueEnd
    });
  }

  return at;
}

/**
 * Every attribute with a quoted value in the tags of a Svelte file, with where the value sits, skipping
 * the contents of `script` and `style`.
 */
export function scanAttributes(text: string) {
  const found: AttributeValue[] = [];
  let at = text.indexOf("<");
  while (at !== -1 && at < text.length) {
    TAG_START.lastIndex = at;
    const match = TAG_START.exec(text);
    const isTag = match !== null && match[1] !== undefined;
    if (!isTag) {
      at = text.indexOf("<", at + 1);
      continue;
    }

    const tag = match[1] ?? "";
    const isRawText = RAW_TEXT_TAGS.has(tag.toLowerCase());
    const afterTag = scanTag({
      text,
      tag,
      start: at + match[0].length,
      found
    });
    const closing = isRawText ? text.indexOf(`</${tag}`, afterTag) : afterTag;
    at = text.indexOf("<", closing === -1 ? text.length : closing);
  }

  return found;
}

/**
 * Whether the source of a component declares the prop with the type `GlyphInput`.
 */
export function declaresAsGlyphInput({ source, prop }: {
  source: string;
  prop: string;
}) {
  const escaped = prop.replaceAll(/[.*+?^${}()|[\]\\]/gu, "\\$&");
  return new RegExp(`\\b${escaped}\\??\\s*:\\s*GlyphInput\\b`, "u").test(source);
}

/**
 * The `.svelte` files a Svelte file imports, by the name each is imported as.
 */
export function importedComponents(text: string) {
  return new Map([...text.matchAll(IMPORT)].map(([, name, path]) => [name ?? "", path ?? ""]));
}
