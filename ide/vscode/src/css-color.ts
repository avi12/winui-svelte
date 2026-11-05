import { parseColor } from "../../../src/css/parse/colors.ts";

const ALPHA_DIGITS = 2;
const OPAQUE_DIGITS = 6;

/**
 * The CSS (`#rrggbb` or `#rrggbbaa`) of a color written in CSS, or undefined when it is not one WinUI can say.
 */
export function cssColorOf(text: string) {
  const xaml = parseColor(text.trim());
  if (xaml === null) {
    return undefined;
  }

  const digits = xaml.slice(1).toLowerCase();
  const isOpaque = digits.length === OPAQUE_DIGITS;
  return isOpaque ? `#${digits}` : `#${digits.slice(ALPHA_DIGITS)}${digits.slice(0, ALPHA_DIGITS)}`;
}
