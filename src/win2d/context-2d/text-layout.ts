import { FontSlant } from "./font.ts";
import type { ParsedFont } from "./font.ts";
import { TextAlign, TextBaseline, TextDirection } from "./names.ts";
import type { ICanvasResourceCreator } from "#winui/microsoft/graphics/canvas/ICanvasResourceCreator";
import { CanvasTextFormat } from "#winui/microsoft/graphics/canvas/text/CanvasTextFormat";
import { CanvasTextLayout } from "#winui/microsoft/graphics/canvas/text/CanvasTextLayout";
import { CanvasWordWrapping } from "#winui/microsoft/graphics/canvas/text/CanvasWordWrapping";
import { FontStyle } from "#winui/windows/ui/text/FontStyle";

// A line of text laid out where the canvas puts it: relative to the point it
// was given, by its alignment and baseline.

// Win2D has no unbounded layout: a box this wide never wraps or aligns a line.
const UNBOUNDED_SIZE = 100_000;
const WHITESPACE = /[\t\n\f\r\v]/gu;
// Where the hanging and ideographic baselines sit between the line's top and
// its alphabetic baseline: the fonts' tables are not readable through Win2D.
const HANGING_FRACTION = 0.2;
const IDEOGRAPHIC_FRACTION = 0.5;

/** The horizontal and vertical offsets of a layout's top left corner from the point text is drawn at. */
function offsetsOf({ width, ascent, height, align, baseline, direction }: {
  width: number;
  ascent: number;
  height: number;
  align: TextAlign;
  baseline: TextBaseline;
  direction: TextDirection;
}) {
  const isRightToLeft = direction === TextDirection.RTL;
  const isStartRight = align === TextAlign.START && isRightToLeft;
  const isEndRight = align === TextAlign.END && !isRightToLeft;
  const isRight = align === TextAlign.RIGHT || isStartRight || isEndRight;
  const isCentered = align === TextAlign.CENTER;
  const tops = new Map<TextBaseline, number>([
    [TextBaseline.TOP, 0],
    [TextBaseline.HANGING, -ascent * HANGING_FRACTION],
    [TextBaseline.MIDDLE, -height / 2],
    [TextBaseline.ALPHABETIC, -ascent],
    [TextBaseline.IDEOGRAPHIC, -(ascent + (height - ascent) * IDEOGRAPHIC_FRACTION)],
    [TextBaseline.BOTTOM, -height]
  ]);
  const left = isCentered ? -width / 2 : 0;
  return {
    left: isRight ? -width : left,
    top: tops.get(baseline) ?? -ascent
  };
}

/** A Win2D text format with a parsed font's family, size, weight and slant, that never wraps. */
function createFormat(font: ParsedFont) {
  const format = new CanvasTextFormat();
  format.fontFamily = font.family;
  format.fontSize = font.size;
  format.fontWeight = { weight: font.weight };
  const slants = new Map<FontSlant, FontStyle>([
    [FontSlant.NORMAL, FontStyle.Normal],
    [FontSlant.ITALIC, FontStyle.Italic],
    [FontSlant.OBLIQUE, FontStyle.Oblique]
  ]);
  format.fontStyle = slants.get(font.slant) ?? FontStyle.Normal;
  format.wordWrapping = CanvasWordWrapping.NoWrap;
  return format;
}

/**
 * Lays a text out: whitespace characters read as spaces, as the canvas does.
 * `left` and `top` are where the layout starts, relative to the point the text
 * is drawn at.
 */
export function placeText({ creator, text, font, align, baseline, direction }: {
  creator: ICanvasResourceCreator;
  text: string;
  font: ParsedFont;
  align: TextAlign;
  baseline: TextBaseline;
  direction: TextDirection;
}) {
  const format = createFormat(font);
  const layout = new CanvasTextLayout(creator, text.replaceAll(WHITESPACE, " "), format, UNBOUNDED_SIZE, UNBOUNDED_SIZE);
  const bounds = layout.layoutBoundsIncludingTrailingWhitespace;
  const [line] = layout.lineMetrics;
  const ascent = line?.baseline ?? font.size;
  const height = line?.height ?? font.size;
  const offsets = offsetsOf({
    width: bounds.width,
    ascent,
    height,
    align,
    baseline,
    direction
  });
  format.close();
  return {
    layout,
    width: bounds.width,
    ascent,
    height,
    ...offsets
  };
}
