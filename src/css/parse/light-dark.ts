import { matchingParenthesis, splitCommas } from "./split.ts";

/** One `light-dark(light, dark)` call, replaced in the value by `var(name)`. */
interface LightDarkPair {
  name: string;
  light: string;
  dark: string;
}

const START = /(?<![\w-])light-dark\(/giu;

/**
 * Replaces each `light-dark(a, b)` in a declaration value by a `var(--name)`,
 * and returns the pairs: the caller declares each name as `a` for the light
 * theme and `b` for the dark one, which WinUI's theme dictionaries pick from
 * at the time the resource is read (a Style cannot depend on the theme).
 */
export function replaceLightDark({ value, nameFor }: {
  value: string;
  nameFor(): string;
}) {
  const pairs: LightDarkPair[] = [];
  let result = "";
  let index = 0;
  for (const match of value.matchAll(START)) {
    const isInsideEarlier = match.index < index;
    const open = match.index + match[0].length - 1;
    const end = isInsideEarlier ? value.length : matchingParenthesis({
      text: value,
      open
    });
    const [light, dark, ...rest] = splitCommas(value.slice(open + 1, end));
    const isReadable = end < value.length && light !== undefined && dark !== undefined && rest.length === 0;
    if (!isReadable) {
      continue;
    }

    const name = nameFor();
    pairs.push({
      name,
      light,
      dark
    });
    result += `${value.slice(index, match.index)}var(${name})`;
    index = end + 1;
  }

  return {
    value: result + value.slice(index),
    pairs
  };
}
