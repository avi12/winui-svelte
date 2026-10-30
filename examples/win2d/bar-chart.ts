// A bar chart drawn the way a charting library draws one: it reads the canvas's
// size, asks it for the "2d" context and draws with nothing but the HTML Canvas
// 2D API (gradients, dashed grid lines, text, save and restore, a clip). Chart.js,
// d3's canvas code or Konva call the same methods, so they draw on a
// `Canvas2D` or a `createCanvas2D` canvas the same way.

const PADDING = 24;
const GRID_LINES = 4;
const BAR_FILL = 0.6;
const LABEL_GAP = 6;
const FONT = "12px sans-serif";
const AXIS_COLOR = "#8892a6";
const GRID_COLOR = "rgba(136, 146, 166, 0.35)";
const TEXT_COLOR = "#e8ecf4";
const BAR_TOP = "#4cc9f0";
const BAR_BOTTOM = "#4361ee";
const DASH_LENGTH = 4;
const HALF_PIXEL = 0.5;

/** The part of a canvas context the chart uses: any HTML canvas context has it. */
interface ChartContext {
  fillStyle: unknown;
  strokeStyle: unknown;
  lineWidth: number;
  font: string;
  textAlign: string;
  textBaseline: string;
  clearRect(x: number, y: number, width: number, height: number): void;
  save(): void;
  restore(): void;
  setLineDash(segments: number[]): void;
  beginPath(): void;
  moveTo(x: number, y: number): void;
  lineTo(x: number, y: number): void;
  stroke(): void;
  rect(x: number, y: number, width: number, height: number): void;
  clip(): void;
  fillRect(x: number, y: number, width: number, height: number): void;
  fillText(text: string, x: number, y: number): void;
  createLinearGradient(
    startX: number,
    startY: number,
    endX: number,
    endY: number
  ): { addColorStop(offset: number, color: string): void };
}

/** The part of a canvas the chart uses: the same members as an HTML canvas element. */
interface ChartCanvas {
  getContext(kind: "2d"): ChartContext | null;
  getBoundingClientRect(): {
    width: number;
    height: number;
  };
}

/** What drawBarChart plots. */
export interface BarChart {
  labels: string[];
  values: number[];
}

/**
 * Draws a bar chart on a canvas, clearing it first. Nothing here knows Win2D:
 * the same function draws on a browser canvas.
 */
export function drawBarChart({ canvas, labels, values }: BarChart & { canvas: ChartCanvas }) {
  const context = canvas.getContext("2d");
  if (!context) {
    return;
  }

  const { width, height } = canvas.getBoundingClientRect();
  const plot = {
    left: PADDING,
    top: PADDING,
    width: width - 2 * PADDING,
    height: height - 2 * PADDING
  };
  const maximum = Math.max(1, ...values);
  context.clearRect(0, 0, width, height);

  context.save();
  context.strokeStyle = GRID_COLOR;
  context.lineWidth = 1;
  context.setLineDash([DASH_LENGTH, DASH_LENGTH]);
  for (let i = 0; i <= GRID_LINES; i++) {
    const y = Math.round(plot.top + plot.height * i / GRID_LINES) + HALF_PIXEL;
    context.beginPath();
    context.moveTo(plot.left, y);
    context.lineTo(plot.left + plot.width, y);
    context.stroke();
  }

  context.restore();

  context.save();
  context.beginPath();
  context.rect(plot.left, plot.top, plot.width, plot.height);
  context.clip();
  const slot = plot.width / Math.max(1, values.length);
  const barWidth = slot * BAR_FILL;
  const gradient = context.createLinearGradient(0, plot.top, 0, plot.top + plot.height);
  gradient.addColorStop(0, BAR_TOP);
  gradient.addColorStop(1, BAR_BOTTOM);
  context.fillStyle = gradient;
  for (const [i, value] of values.entries()) {
    const barHeight = plot.height * value / maximum;
    const left = plot.left + slot * i + (slot - barWidth) / 2;
    context.fillRect(left, plot.top + plot.height - barHeight, barWidth, barHeight);
  }

  context.restore();

  context.strokeStyle = AXIS_COLOR;
  context.lineWidth = 2;
  context.beginPath();
  context.moveTo(plot.left, plot.top);
  context.lineTo(plot.left, plot.top + plot.height);
  context.lineTo(plot.left + plot.width, plot.top + plot.height);
  context.stroke();

  context.font = FONT;
  context.fillStyle = TEXT_COLOR;
  context.textAlign = "center";
  context.textBaseline = "top";
  for (const [i, label] of labels.entries()) {
    context.fillText(label, plot.left + slot * i + slot / 2, plot.top + plot.height + LABEL_GAP);
  }
}
