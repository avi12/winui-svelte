const IDENTIFIER = /^-?[_a-zA-Z][\w-]*$/u;
const WHITESPACE = /\s+/u;
const CLASS_ATTRIBUTES = /\bclass\s*=\s*["']([^"']*)["']/gu;
const CLASS_SELECTORS = /\.(-?[_a-zA-Z][\w-]*)/gu;
const UPPER_AFTER_LOWER = /(?<=[a-z0-9])(?=[A-Z])/gu;
const UNSAFE_IN_NAME = /[^\w-]+/gu;
const EDGE_HYPHENS = /^-+|-+$/gu;

/**
 * A tag name as a class name: `TextBlock` is `text-block`.
 */
export function kebab(tagName: string) {
  return tagName.replaceAll(".", "-").replaceAll(UPPER_AFTER_LOWER, "-").toLowerCase();
}

/**
 * A value as a word of a class name.
 */
export function slug(value: string) {
  return value.replaceAll(UNSAFE_IN_NAME, "-").replaceAll(EDGE_HYPHENS, "");
}

/**
 * The name, or the name with the first number that makes it new.
 */
export function unusedClass({ base, taken }: {
  base: string;
  taken: Set<string>;
}) {
  let name = base;
  for (let suffix = 2; taken.has(name); suffix += 1) {
    name = `${base}-${suffix}`;
  }

  return name;
}

/**
 * Every class a file writes in an attribute or selects in its style.
 */
export function classesIn(fileText: string) {
  const written = [...fileText.matchAll(CLASS_ATTRIBUTES)].flatMap(match => (match[1] ?? "").split(" "));
  const selected = [...fileText.matchAll(CLASS_SELECTORS)].map(match => match[1] ?? "");
  return new Set([...written, ...selected].filter(name => name !== ""));
}

/**
 * The first class of a class attribute's value, if it is a plain class name.
 */
export function firstClassOf(value: string) {
  const [first] = value.trim().split(WHITESPACE);
  const isIdentifier = first !== undefined && IDENTIFIER.test(first);
  return isIdentifier ? first : undefined;
}
