import { spawnSync } from "node:child_process";
import path from "node:path";
import { z } from "zod";

// The colors of points of an example's window, as Windows draws it
// (examples/harness/window-pixels.ps1, window-capture.ps1), or of the screen
// itself (screen-capture.ps1, for what a window with alpha blends over): what a test looks
// at to see an effect that Composition draws, which no XAML control reports.

const HARNESS_FOLDER = path.join(import.meta.dirname, "..", "examples", "harness");
const SCRIPT = path.join(HARNESS_FOLDER, "window-pixels.ps1");
const CAPTURE_SCRIPT = path.join(HARNESS_FOLDER, "window-capture.ps1");
const SCREEN_CAPTURE_SCRIPT = path.join(HARNESS_FOLDER, "screen-capture.ps1");
const SCREEN_AREAS_SCRIPT = path.join(HARNESS_FOLDER, "screen-areas.ps1");
const PIXELS_TIMEOUT_MILLISECONDS = 60_000;
const colorsSchema = z.array(z.string());
const HEX_RADIX = 16;
const RED_END = 2;
const GREEN_END = 4;

interface Point {
  x: number;
  y: number;
}

function formatted(points: readonly Point[]) {
  return points.map(({ x, y }) => `${x},${y}`).join(";");
}

// Runs a script of examples/harness and reads the RRGGBB colors it prints.
function colorsOf({ script, args }: {
  script: string;
  args: string[];
}) {
  const result = spawnSync("powershell.exe", [
    "-NoProfile",
    "-ExecutionPolicy",
    "Bypass",
    "-File",
    script,
    ...args
  ], {
    encoding: "utf8",
    timeout: PIXELS_TIMEOUT_MILLISECONDS
  });
  const isFailed = result.status !== 0;
  if (isFailed) {
    throw new Error(`${path.basename(script)} failed: ${result.stderr.trim() || result.stdout.trim()}`);
  }

  return colorsSchema.parse(JSON.parse(result.stdout.trim())).map(color => ({
    r: Number.parseInt(color.slice(0, RED_END), HEX_RADIX),
    g: Number.parseInt(color.slice(RED_END, GREEN_END), HEX_RADIX),
    b: Number.parseInt(color.slice(GREEN_END), HEX_RADIX)
  }));
}

/** What `window-pixels.ps1` is asked. */
export interface PixelsRequest {
  pid: number;
  scale: number;

  /** The color the content starts at, as RRGGBB. */
  origin: string;

  /** In device-independent pixels from the top left of the content. */
  points: readonly Point[];
}

/** The colors of the points, in the order they were asked. */
export function windowPixels({ pid, scale, origin, points }: PixelsRequest) {
  return colorsOf({
    script: SCRIPT,
    args: [
      "-ProcessId",
      String(pid),
      "-Scale",
      String(scale),
      "-Origin",
      origin,
      "-Points",
      formatted(points)
    ]
  });
}

/** What `window-capture.ps1` is asked. */
export interface CaptureRequest {
  pid: number;

  /** In device pixels from the top left of the window itself. */
  points: readonly Point[];

  /** A PNG file to write the capture to, to look at. */
  savePath?: string;
}

/**
 * The colors of the points of the window as PrintWindow draws it, in the order
 * they were asked. PrintWindow has no alpha: a window with a transparent
 * backdrop is drawn over black, so a clear pixel reads 0, 0, 0.
 */
export function windowCapture({ pid, points, savePath = "" }: CaptureRequest) {
  return colorsOf({
    script: CAPTURE_SCRIPT,
    args: [
      "-ProcessId",
      String(pid),
      "-Points",
      formatted(points),
      "-Save",
      savePath
    ]
  });
}

/** What `screen-capture.ps1` is asked. */
export interface ScreenCaptureRequest {
  /** In device pixels of the virtual screen. */
  rectangle: Rectangle;

  /** In device pixels from the rectangle's top left. */
  points: readonly Point[];

  /** A PNG file to write the capture to, to look at. */
  savePath?: string;
}

/** A rectangle of the screen, in device pixels. */
export interface Rectangle {
  x: number;
  y: number;
  width: number;
  height: number;
}

/**
 * The colors of the points of the screen as Windows composes it, in the order
 * they were asked: every window above a point counts, and a window with
 * per-pixel alpha is blended over what is behind it. It reads pixels only.
 */
export function screenCapture({ rectangle, points, savePath = "" }: ScreenCaptureRequest) {
  return colorsOf({
    script: SCREEN_CAPTURE_SCRIPT,
    args: [
      "-X",
      String(rectangle.x),
      "-Y",
      String(rectangle.y),
      "-Width",
      String(rectangle.width),
      "-Height",
      String(rectangle.height),
      "-Points",
      formatted(points),
      "-Save",
      savePath
    ]
  });
}

const rectanglesSchema = z.array(
  z.object({
    x: z.number(),
    y: z.number(),
    width: z.number(),
    height: z.number()
  })
);

/** The work area of every display, in device pixels of the virtual screen. */
export function screenAreas() {
  const result = spawnSync("powershell.exe", [
    "-NoProfile",
    "-ExecutionPolicy",
    "Bypass",
    "-File",
    SCREEN_AREAS_SCRIPT
  ], {
    encoding: "utf8",
    timeout: PIXELS_TIMEOUT_MILLISECONDS
  });
  const isFailed = result.status !== 0;
  if (isFailed) {
    throw new Error(`screen-areas.ps1 failed: ${result.stderr.trim() || result.stdout.trim()}`);
  }

  return rectanglesSchema.parse(JSON.parse(result.stdout.trim()));
}
