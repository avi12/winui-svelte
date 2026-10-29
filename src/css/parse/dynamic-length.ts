import { evaluateCalc } from "./calc.ts";
import type { Viewport } from "./media.ts";

/**
 * A length that depends on a size known only when the window is laid out: a
 * `calc()`, `min()`, `max()` or `clamp()` with a percentage of the parent, a
 * viewport unit (`vw`, `vh`, `vmin`, `vmax`) or a container unit (`cqw`, `cqh`,
 * `cqi`, `cqb`, `cqmin`, `cqmax`).
 */
const FUNCTION_START = /^(calc|min|max|clamp)\(/iu;
const DYNAMIC_UNIT = /(\d|\.)(%|vw|vh|vmin|vmax|cqw|cqh|cqi|cqb|cqmin|cqmax)(?![\w%])/iu;
const AMOUNT_WITH_UNIT = /(-?\d*\.?\d+)(%|vw|vh|vmin|vmax|cqw|cqh|cqi|cqb|cqmin|cqmax)(?![\w%])/giu;
const PERCENT_SCALE = 100;
const PIXEL_DIGITS = 4;

/** The sizes the units of a dynamic length are fractions of; null where it is unknown. */
export interface LengthBasis {
  /** What 100% is: the parent's size along the axis the property is on. */
  percent: number | null;
  viewport: Viewport | null;
  container: Viewport | null;
}

/** Whether a value is a function of lengths that has a unit only the layout knows. */
export function isDynamicLength(value: string) {
  const text = value.trim();
  return FUNCTION_START.test(text) && DYNAMIC_UNIT.test(text);
}

function unitSize({ unit, basis }: {
  unit: string;
  basis: LengthBasis;
}) {
  const { viewport, container } = basis;
  const sizes = new Map<string, number | null>([
    ["%", basis.percent],
    ["vw", viewport?.width ?? null],
    ["vh", viewport?.height ?? null],
    ["vmin", viewport === null ? null : Math.min(viewport.width, viewport.height)],
    ["vmax", viewport === null ? null : Math.max(viewport.width, viewport.height)],
    ["cqw", container?.width ?? null],
    ["cqi", container?.width ?? null],
    ["cqh", container?.height ?? null],
    ["cqb", container?.height ?? null],
    ["cqmin", container === null ? null : Math.min(container.width, container.height)],
    ["cqmax", container === null ? null : Math.max(container.width, container.height)]
  ]);
  return sizes.get(unit.toLowerCase()) ?? null;
}

/**
 * The pixels a dynamic length comes to against these sizes (each unit is that
 * percent of its size), through the same fold `calc()` uses; null when a unit's
 * size is unknown or the expression is not a length.
 */
export function resolveDynamicLength({ expression, basis }: {
  expression: string;
  basis: LengthBasis;
}) {
  let isKnown = true;
  const pixels = expression.replaceAll(AMOUNT_WITH_UNIT, (_whole, amount: string, unit: string) => {
    const size = unitSize({
      unit,
      basis
    });
    isKnown &&= size !== null;
    return `${(Number(amount) / PERCENT_SCALE * (size ?? 0)).toFixed(PIXEL_DIGITS)}px`;
  });
  return isKnown ? evaluateCalc(pixels) : null;
}
