// The words of the window's .svelte markup, read without WinUI: a kebab-case
// tag or attribute as the class or property it names, and the quoted values
// XAML spells as text (a Thickness, a grid length, a number).

/** The separator between the words of a kebab-case tag or attribute. */
export const WORD_SEPARATOR = "-";
const LIST_SEPARATOR = ",";
const AUTO_LENGTH = "Auto";
const STAR_SUFFIX = "*";

/** The units a XAML grid length is written in. */
export const GridUnit = {
  AUTO: "auto",
  PIXEL: "pixel",
  STAR: "star"
} as const;

/** One of the {@link GridUnit} values. */
export type GridUnit = typeof GridUnit[keyof typeof GridUnit];

/** A grid length as markup spells it, before WinUI's `GridLength` is built from it. */
export interface GridLength {
  unit: GridUnit;
  value: number;
}

/**
 * A kebab-case tag or attribute as a class name: `text-block` is `TextBlock`.
 *
 * @param name - The kebab-case name.
 * @returns The PascalCase name.
 */
export function pascalCase(name: string) {
  return name.split(WORD_SEPARATOR).map(word => `${word.charAt(0).toUpperCase()}${word.slice(1)}`).join("");
}

/**
 * A kebab-case attribute as a property name: `vertical-alignment` is `verticalAlignment`.
 *
 * @param name - The kebab-case name.
 * @returns The camelCase name.
 */
export function camelCase(name: string) {
  const pascal = pascalCase(name);
  return `${pascal.charAt(0).toLowerCase()}${pascal.slice(1)}`;
}

/**
 * A class name as its tag: `TextBlock` is `<text-block>`, and an acronym is
 * one word (`InlineUIContainer` is `<inline-ui-container>`). A tag, or a
 * camelCase property name, comes out as itself in kebab case.
 *
 * @param name - The class name, property name or tag.
 * @returns The kebab-case tag.
 */
export function kebabCase(name: string) {
  return name
    .replace(/(?<=[a-z0-9])(?=[A-Z])/gu, WORD_SEPARATOR)
    .replace(/(?<=[A-Z])(?=[A-Z][a-z])/gu, WORD_SEPARATOR)
    .toLowerCase();
}

/**
 * Whether a quoted attribute value is a number.
 *
 * @param text - The attribute's text.
 * @returns True for `"8"` and `"1.5"`, false for `""` and `"Center"`.
 */
export function isNumeric(text: string) {
  return text.trim() !== "" && Number.isFinite(Number(text));
}

/**
 * A comma-separated attribute value as its trimmed items.
 *
 * @param text - The attribute's text, such as `"Auto, *, 2*"`.
 * @returns The items, in order.
 */
export function splitList(text: string) {
  return text.split(LIST_SEPARATOR).map(item => item.trim());
}

/**
 * A `Thickness` as XAML writes it: `"8"` for every side, `"8,4"` for
 * left-right and top-bottom, or four sides in the order left, top, right,
 * bottom.
 *
 * @param text - The attribute's text.
 * @returns The width of each side.
 */
export function thicknessSides(text: string) {
  const [left = 0, top = left, right = left, bottom = top] = splitList(text).map(Number);
  return {
    left,
    top,
    right,
    bottom
  };
}

/**
 * A grid length as XAML writes it: `"Auto"`, `"*"`, `"2*"` or pixels.
 *
 * @param text - The attribute's text.
 * @returns The unit and its value.
 */
export function gridLength(text: string) {
  const isAuto = text === AUTO_LENGTH;
  if (isAuto) {
    return {
      unit: GridUnit.AUTO,
      value: 1
    };
  }

  return text.endsWith(STAR_SUFFIX) ? starLength(text.slice(0, -STAR_SUFFIX.length)) : {
    unit: GridUnit.PIXEL,
    value: Number(text)
  };
}

// "*" alone weighs 1.
function starLength(weight: string) {
  return {
    unit: GridUnit.STAR,
    value: weight === "" ? 1 : Number(weight)
  };
}
