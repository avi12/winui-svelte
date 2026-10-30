import { spawnSync } from "node:child_process";
import path from "node:path";
import { z } from "zod";

// The colors of points of an example's window, as Windows draws it
// (examples/harness/window-pixels.ps1): what a test looks at to see an effect
// that Composition draws, which no XAML control reports.

const SCRIPT = path.join(import.meta.dirname, "..", "examples", "harness", "window-pixels.ps1");
const PIXELS_TIMEOUT_MILLISECONDS = 60_000;
const colorsSchema = z.array(z.string());
const HEX_RADIX = 16;
const RED_END = 2;
const GREEN_END = 4;

/** What `window-pixels.ps1` is asked. */
export interface PixelsRequest {
  pid: number;
  scale: number;

  /** The color the content starts at, as RRGGBB. */
  origin: string;

  /** In device-independent pixels from the top left of the content. */
  points: ReadonlyArray<{
    x: number;
    y: number;
  }>;
}

/** The colors of the points, in the order they were asked. */
export function windowPixels({ pid, scale, origin, points }: PixelsRequest) {
  const result = spawnSync("powershell.exe", [
    "-NoProfile",
    "-ExecutionPolicy",
    "Bypass",
    "-File",
    SCRIPT,
    "-ProcessId",
    String(pid),
    "-Scale",
    String(scale),
    "-Origin",
    origin,
    "-Points",
    points.map(({ x, y }) => `${x},${y}`).join(";")
  ], {
    encoding: "utf8",
    timeout: PIXELS_TIMEOUT_MILLISECONDS
  });
  const isFailed = result.status !== 0;
  if (isFailed) {
    throw new Error(`window-pixels failed: ${result.stderr.trim() || result.stdout.trim()}`);
  }

  return colorsSchema.parse(JSON.parse(result.stdout.trim())).map(color => ({
    r: Number.parseInt(color.slice(0, RED_END), HEX_RADIX),
    g: Number.parseInt(color.slice(RED_END, GREEN_END), HEX_RADIX),
    b: Number.parseInt(color.slice(GREEN_END), HEX_RADIX)
  }));
}
