import type { BoxKind } from "./css-box.ts";
import { TrackKind } from "./css-box.ts";
import type { Timing } from "./css-easing.ts";
import type { GradientPreview } from "./css-gradient.ts";
import type { Material, ShadowDepth } from "./css-shadow.ts";

const NAMESPACE = "http://www.w3.org/2000/svg";
const INK = "#888888";
const FAINT = "#88888844";
const ACCENT = "#0078d4";
const CHECKER = 6;
const PERCENT = 100;
const BYTE = 255;
const OPACITY_DIGITS = 3;
const TEXT_BASELINE = 5;
const LABEL_INSET = 6;
const LABEL_DROP = 4;
const BLUR_DIVISOR = 8;
const BLUR_LIMIT = 8;
const LADDER_ROWS = 3;
const TRANSLUCENT_OPACITY = 0.6;
const SAMPLE_BASELINE = 7;

const BAR = {
  width: 160,
  height: 20
};
const INLINE_BAR = {
  width: 36,
  height: 12
};
const CURVE = {
  size: 96,
  pad: 8
};
const INLINE_CURVE = {
  size: 14,
  pad: 1
};
const TIMELINE = {
  width: 220,
  row: 18,
  gap: 6,
  label: 70
};
const BOX = {
  width: 220,
  height: 130,
  step: 22
};
const LADDER = {
  cell: 44,
  gap: 14,
  pad: 14,
  label: 14
};
const MATERIAL = {
  width: 90,
  height: 36,
  gap: 8
};
const SAMPLE = {
  width: 120,
  height: 44
};

function svg({ width, height, body }: {
  width: number;
  height: number;
  body: string;
}) {
  return `<svg xmlns="${NAMESPACE}" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">${body}</svg>`;
}

function escaped(text: string) {
  return text.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;");
}

function opaque(hex: string) {
  return hex.slice(0, "#rrggbb".length);
}

function opacityOf(hex: string) {
  const alpha = hex.slice("#rrggbb".length);
  return alpha === "" ? 1 : Number.parseInt(alpha, 16) / BYTE;
}

function checkered({ width, height }: {
  width: number;
  height: number;
}) {
  return `<defs><pattern id="c" width="${CHECKER * 2}" height="${CHECKER * 2}" patternUnits="userSpaceOnUse">`
    + `<rect width="${CHECKER * 2}" height="${CHECKER * 2}" fill="#ffffff"/>`
    + `<rect width="${CHECKER}" height="${CHECKER}" fill="#cccccc"/><rect x="${CHECKER}" y="${CHECKER}" width="${CHECKER}" height="${CHECKER}" fill="#cccccc"/>`
    + `</pattern></defs><rect width="${width}" height="${height}" fill="url(#c)"/>`;
}

function barSvg({ gradient, width, height }: {
  gradient: GradientPreview;
  width: number;
  height: number;
}) {
  const stops = gradient.stops.map(stop => `<stop offset="${stop.position * PERCENT}%" stop-color="${opaque(stop.color)}" stop-opacity="${opacityOf(stop.color).toFixed(OPACITY_DIGITS)}"/>`).join("");
  return svg({
    width,
    height,
    body: `${checkered({
      width,
      height
    })}<defs><linearGradient id="g" x1="0" x2="1" y1="0" y2="0">${stops}</linearGradient></defs>`
      + `<rect width="${width}" height="${height}" fill="url(#g)" stroke="${INK}"/>`
  });
}

/** The gradient as a bar of the stops left to right, over a checkerboard so that transparency shows. */
export function gradientBarSvg(gradient: GradientPreview) {
  return barSvg({
    gradient,
    ...BAR
  });
}

/** The same bar, small enough to sit in a line of code. */
export function gradientInlineSvg(gradient: GradientPreview) {
  return barSvg({
    gradient,
    ...INLINE_BAR
  });
}

function curveSvg({ samples, size, pad }: {
  samples: number[];
  size: number;
  pad: number;
}) {
  const inner = size - pad * 2;
  const last = samples.length - 1;
  const points = samples.map((sample, i) => `${(pad + inner * i / last).toFixed(1)},${(size - pad - inner * sample).toFixed(1)}`).join(" ");
  return svg({
    width: size,
    height: size,
    body: `<rect x="${pad}" y="${pad}" width="${inner}" height="${inner}" fill="none" stroke="${FAINT}"/>`
      + `<line x1="${pad}" y1="${size - pad}" x2="${size - pad}" y2="${pad}" stroke="${FAINT}" stroke-dasharray="2 2"/>`
      + `<polyline points="${points}" fill="none" stroke="${ACCENT}" stroke-width="2"/>`
  });
}

/** The easing as a curve of progress against time, with the straight line it departs from. */
export function curveBigSvg(samples: number[]) {
  return curveSvg({
    samples,
    ...CURVE
  });
}

/** The same curve, small enough to sit in a line of code. */
export function curveInlineSvg(samples: number[]) {
  return curveSvg({
    samples,
    ...INLINE_CURVE
  });
}

/** One row per timing: the delay as an outline, then the duration as a filled bar, on one time scale. */
export function timelineSvg(timings: Timing[]) {
  const total = Math.max(...timings.map(timing => timing.delayMs + timing.durationMs), 1);
  const scale = (TIMELINE.width - TIMELINE.label) / total;
  const rows = timings.map((timing, i) => {
    const y = i * (TIMELINE.row + TIMELINE.gap);
    const delay = timing.delayMs * scale;
    return `<text x="0" y="${y + TIMELINE.row - TEXT_BASELINE}" font-size="11" fill="${INK}">${escaped(timing.name || "animation")}</text>`
      + `<rect x="${TIMELINE.label}" y="${y}" width="${Math.max(delay, 0)}" height="${TIMELINE.row}" fill="none" stroke="${INK}" stroke-dasharray="3 2"/>`
      + `<rect x="${TIMELINE.label + delay}" y="${y}" width="${timing.durationMs * scale}" height="${TIMELINE.row}" fill="${ACCENT}"/>`;
  });
  return svg({
    width: TIMELINE.width,
    height: timings.length * (TIMELINE.row + TIMELINE.gap),
    body: rows.join("")
  });
}

function valueLabel({ text, x, y }: {
  text: number;
  x: number;
  y: number;
}) {
  return `<text x="${x}" y="${y}" font-size="12" text-anchor="middle" fill="currentColor">${text}</text>`;
}

/** The box model of a value: the element in the middle, the four values around it, nested one frame inside the next. */
export function boxSvg({ kind, values }: {
  kind: BoxKind;
  values: number[];
}) {
  const [top = 0, right = 0, bottom = 0, left = 0] = values;
  const inset = BOX.step;
  const middleX = BOX.width / 2;
  const middleY = BOX.height / 2;
  const isCorners = kind === "corners";
  const radius = isCorners ? Math.min(...values, inset) : 0;
  return svg({
    width: BOX.width,
    height: BOX.height,
    body: `<rect x="1" y="1" width="${BOX.width - 2}" height="${BOX.height - 2}" fill="none" stroke="${INK}" stroke-dasharray="4 3" rx="${radius}"/>`
      + `<rect x="${inset + 1}" y="${inset + 1}" width="${BOX.width - inset * 2 - 2}" height="${BOX.height - inset * 2 - 2}" fill="${FAINT}" stroke="${ACCENT}" rx="${radius}"/>`
      + valueLabel({
        text: top,
        x: middleX,
        y: inset - LABEL_INSET
      })
      + valueLabel({
        text: bottom,
        x: middleX,
        y: BOX.height - LABEL_INSET
      })
      + valueLabel({
        text: left,
        x: inset / 2,
        y: middleY + LABEL_DROP
      })
      + valueLabel({
        text: right,
        x: BOX.width - inset / 2,
        y: middleY + LABEL_DROP
      })
  });
}

function trackFill(kind: TrackKind) {
  const isPixels = kind === TrackKind.PIXELS;
  if (isPixels) {
    return ACCENT;
  }

  return kind === TrackKind.FRACTION ? FAINT : "none";
}

/** The tracks of a grid as bars across one row: a pixel track solid, an `fr` track faint, an `auto` track outlined. */
export function tracksSvg(tracks: {
  kind: TrackKind;
  amount: number;
  share: number;
}[]) {
  const width = BOX.width;
  const height = BAR.height * 2;
  let x = 0;
  const bars = tracks.map(track => {
    const span = track.share * width;
    const fill = trackFill(track.kind);
    const text = track.kind === TrackKind.AUTO ? "auto" : `${track.amount}${track.kind}`;
    const bar = `<rect x="${x + 1}" y="1" width="${Math.max(span - 2, 1)}" height="${height - 2}" fill="${fill}" stroke="${INK}"/>`
      + `<text x="${x + span / 2}" y="${height / 2 + LABEL_DROP}" font-size="11" text-anchor="middle" fill="currentColor">${text}</text>`;
    x += span;
    return bar;
  });
  return svg({
    width,
    height,
    body: bars.join("")
  });
}

/** The depths WinUI uses as squares with a shadow each, the one nearest the value outlined. */
export function ladderSvg({ steps, nearest }: {
  steps: readonly ShadowDepth[];
  nearest: number;
}) {
  const cells = steps.map((step, i) => {
    const x = LADDER.pad + i * (LADDER.cell + LADDER.gap);
    const blur = Math.min(step.depth / BLUR_DIVISOR, BLUR_LIMIT);
    const outline = i === nearest ? ACCENT : INK;
    return `<g filter="url(#s${i})"><rect x="${x}" y="${LADDER.pad}" width="${LADDER.cell}" height="${LADDER.cell}" fill="#ffffff" stroke="${outline}" stroke-width="${i === nearest ? 2 : 1}"/></g>`
      + `<defs><filter id="s${i}" x="-50%" y="-50%" width="200%" height="200%"><feDropShadow dx="0" dy="${blur / 2}" stdDeviation="${blur}" flood-opacity="0.45"/></filter></defs>`
      + `<text x="${x + LADDER.cell / 2}" y="${LADDER.pad * 2 + LADDER.cell + LADDER.label}" font-size="11" text-anchor="middle" fill="currentColor">${step.depth}</text>`;
  });
  return svg({
    width: LADDER.pad * 2 + steps.length * (LADDER.cell + LADDER.gap) - LADDER.gap,
    height: LADDER.pad * LADDER_ROWS + LADDER.cell + LADDER.label,
    body: cells.join("")
  });
}

function swatch({ color, x, opacity }: {
  color: string;
  x: number;
  opacity: number;
}) {
  return `<rect x="${x}" y="1" width="${MATERIAL.width}" height="${MATERIAL.height}" fill="${color}" fill-opacity="${opacity}" stroke="${INK}"/>`;
}

/** The material as two swatches, the light theme's and the dark theme's; a translucent one is drawn see-through. */
export function materialSvg(material: Material) {
  const opacity = material.isTranslucent ? TRANSLUCENT_OPACITY : 1;
  return svg({
    width: MATERIAL.width * 2 + MATERIAL.gap + 2,
    height: MATERIAL.height + 2,
    body: checkered({
      width: MATERIAL.width * 2 + MATERIAL.gap + 2,
      height: MATERIAL.height + 2
    }) + swatch({
      color: material.light,
      x: 1,
      opacity
    }) + swatch({
      color: material.dark,
      x: MATERIAL.width + MATERIAL.gap + 1,
      opacity
    })
  });
}

/** A line of text in the foreground color over the background color, as the pair reads. */
export function contrastSampleSvg({ foreground, background }: {
  foreground: string;
  background: string;
}) {
  return svg({
    width: SAMPLE.width,
    height: SAMPLE.height,
    body: `${checkered(SAMPLE)}<rect width="${SAMPLE.width}" height="${SAMPLE.height}" fill="${opaque(background)}" fill-opacity="${opacityOf(background)}" stroke="${INK}"/>`
      + `<text x="${SAMPLE.width / 2}" y="${SAMPLE.height / 2 + SAMPLE_BASELINE}" font-size="22" font-weight="600" text-anchor="middle" fill="${opaque(foreground)}" fill-opacity="${opacityOf(foreground)}">Aa Bb</text>`
  });
}
