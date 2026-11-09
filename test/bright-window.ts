import type { Report } from "./example-process.ts";
import { numberOf } from "./example-process.ts";
import type { Rectangle } from "./window-pixels.ts";
import type { ChildProcessByStdio } from "node:child_process";
import { spawn, spawnSync } from "node:child_process";
import path from "node:path";
import { createInterface } from "node:readline";
import type { Readable } from "node:stream";

// The bright green window that a test puts behind a window of an example, and
// the helpers both screen tests (transparent-window, click-through) share.

const BRIGHT_READY_MILLISECONDS = 30_000;
const COLOR_TOLERANCE = 12;
const BRIGHT_SCRIPT = path.join(import.meta.dirname, "..", "examples", "harness", "bright-window.ps1");

export const WINDOW_WIDTH = 400;
export const WINDOW_HEIGHT = 300;
export const MARGIN_X = 30;
export const MARGIN_Y = 31;
export const FAR_AWAY = -30_000;
export const BRIGHT_GREEN = {
  r: 0,
  g: 255,
  b: 0
};

const BRIGHT_WIDTH = WINDOW_WIDTH + 2 * MARGIN_X;
const BRIGHT_HEIGHT = WINDOW_HEIGHT + 2 * MARGIN_Y;

export interface Color {
  r: number;
  g: number;
  b: number;
}

export function isNear({ color, expected }: {
  color: Color;
  expected: Color;
}) {
  return Math.abs(color.r - expected.r) <= COLOR_TOLERANCE
    && Math.abs(color.g - expected.g) <= COLOR_TOLERANCE
    && Math.abs(color.b - expected.b) <= COLOR_TOLERANCE;
}

// A bright window that a test started and owns, ended by its pid.
export class BrightWindow {
  readonly pid: number;
  private readonly child: ChildProcessByStdio<null, Readable, null>;

  private constructor(child: ChildProcessByStdio<null, Readable, null>) {
    this.child = child;
    this.pid = child.pid ?? 0;
  }

  static async open(rectangle: Rectangle) {
    const child = spawn("powershell.exe", [
      "-NoProfile",
      "-ExecutionPolicy",
      "Bypass",
      "-File",
      BRIGHT_SCRIPT,
      "-X",
      String(rectangle.x),
      "-Y",
      String(rectangle.y),
      "-Width",
      String(rectangle.width),
      "-Height",
      String(rectangle.height)
    ], {
      stdio: ["ignore", "pipe", "inherit"],
      windowsHide: true
    });
    const bright = new BrightWindow(child);
    const ready = new Promise<void>(resolve => {
      createInterface({ input: child.stdout }).on("line", line => {
        const isReady = line.trim() === "ready";
        if (isReady) {
          resolve();
        }
      });
    });
    const timeout = new Promise<never>((_resolve, reject) => {
      setTimeout(() => reject(new Error("the bright window did not open")), BRIGHT_READY_MILLISECONDS);
    });
    await Promise.race([ready, timeout]);
    return bright;
  }

  close() {
    spawnSync("taskkill", ["/PID", String(this.child.pid), "/T", "/F"]);
  }
}

export function boundsOf(report: Report) {
  const { bounds } = report;
  const isRecord = typeof bounds === "object" && bounds !== null && !Array.isArray(bounds);
  if (!isRecord) {
    throw new Error("the report carries bounds");
  }

  const record: Report = bounds;
  function side(name: string) {
    return numberOf({
      report: record,
      field: name
    });
  }

  return {
    x: side("x"),
    y: side("y"),
    width: side("width"),
    height: side("height")
  };
}

// The bottom-right corner of the display's work area.
export function brightRectangleOf(area: Rectangle) {
  return {
    x: area.x + area.width - BRIGHT_WIDTH,
    y: area.y + area.height - BRIGHT_HEIGHT,
    width: BRIGHT_WIDTH,
    height: BRIGHT_HEIGHT
  };
}

export function placeCommand(rectangle: Rectangle) {
  return {
    command: {
      cmd: "place",
      ...rectangle
    },
    kind: "place"
  };
}
