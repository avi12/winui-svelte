import type { Report } from "./example-process.ts";
import { ExampleProcess, IS_WINDOWS_APP_SDK_RESTORED, numberOf } from "./example-process.ts";
import type { Rectangle } from "./window-pixels.ts";
import { screenAreas, screenCapture } from "./window-pixels.ts";
import assert from "node:assert/strict";
import type { ChildProcessByStdio } from "node:child_process";
import { spawn, spawnSync } from "node:child_process";
import { mkdirSync } from "node:fs";
import path from "node:path";
import { createInterface } from "node:readline";
import type { Readable } from "node:stream";
import type { TestContext } from "node:test";
import { test } from "node:test";

// A transparent window (examples/transparent-window: one dark card on a
// borderless tool window) over a bright green window that the test opens
// behind it, read from the screen itself: CopyFromScreen sees what Windows
// composes, alpha included, where PrintWindow draws clear pixels black and so
// cannot tell clear from opaque. The same window with `--backdrop none` is the
// control that proves the capture can tell them apart. The windows have to be
// on the screen the person works at (a desktop of its own is not composed, so
// its screen reads black, which scripts/test-windows.ts says), they are never
// activated, and the bright window sits where nothing else covers it: the test
// tries the bottom-right corner of every display and is skipped, with the
// reason, when another window covers all of them. Skipped too where the Windows
// App SDK was not restored.

const TIMEOUT_MILLISECONDS = 300_000;
const BRIGHT_READY_MILLISECONDS = 30_000;
const SETTLE_MILLISECONDS = 1500;
const RETRY_MILLISECONDS = 500;
const READ_ATTEMPTS = 8;
const WINDOW_WIDTH = 400;
const WINDOW_HEIGHT = 300;
const MARGIN_X = 30;
const MARGIN_Y = 31;
const BRIGHT_WIDTH = WINDOW_WIDTH + 2 * MARGIN_X;
const BRIGHT_HEIGHT = WINDOW_HEIGHT + 2 * MARGIN_Y;
const FAR_AWAY = -30_000;
const EDGE_PROBE = 8;
const CORNER_PROBE = 1;
const TOP_PROBE = 10;
const COLOR_TOLERANCE = 12;
const CARD_DARK_MAXIMUM = 90;
const CARD_TINT_MINIMUM = 10;
const BRIGHT_GREEN = {
  r: 0,
  g: 255,
  b: 0
};
const CAPTURE_FOLDER = path.join(import.meta.dirname, "..", ".verify", "transparent-window");
const BRIGHT_SCRIPT = path.join(import.meta.dirname, "..", "examples", "harness", "bright-window.ps1");
const NOT_BACKGROUND = { WINUI_SVELTE_BACKGROUND: "" };

interface Color {
  r: number;
  g: number;
  b: number;
}

function isNear({ color, expected }: {
  color: Color;
  expected: Color;
}) {
  return Math.abs(color.r - expected.r) <= COLOR_TOLERANCE
    && Math.abs(color.g - expected.g) <= COLOR_TOLERANCE
    && Math.abs(color.b - expected.b) <= COLOR_TOLERANCE;
}

// A bright window that this test started and owns, ended by its pid.
class BrightWindow {
  private readonly child: ChildProcessByStdio<null, Readable, null>;

  private constructor(child: ChildProcessByStdio<null, Readable, null>) {
    this.child = child;
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

function boundsOf(report: Report) {
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
function brightRectangleOf(area: Rectangle) {
  return {
    x: area.x + area.width - BRIGHT_WIDTH,
    y: area.y + area.height - BRIGHT_HEIGHT,
    width: BRIGHT_WIDTH,
    height: BRIGHT_HEIGHT
  };
}

const PROBE_NAMES = ["corner", "topEdge", "farCorner", "card", "beside", "below"] as const;

type ProbeName = (typeof PROBE_NAMES)[number];

function colorAt({ colors, probe }: {
  colors: ReadonlyMap<ProbeName, Color | undefined>;
  probe: ProbeName;
}) {
  const color = colors.get(probe);
  assert.ok(color !== undefined, `${probe} was read`);
  return color;
}

// Where the probes sit, in device pixels from the bright window's top left
// (the window is placed MARGIN_X and MARGIN_Y inside it).
function probesOf(placed: Rectangle) {
  const left = MARGIN_X;
  const top = MARGIN_Y;
  const middle = Math.round(placed.width / 2);
  const centerY = Math.round(placed.height / 2);
  return {
    corner: {
      x: left + CORNER_PROBE,
      y: top + CORNER_PROBE
    },
    topEdge: {
      x: left + middle,
      y: top + TOP_PROBE
    },
    farCorner: {
      x: left + placed.width - 1 - CORNER_PROBE,
      y: top + placed.height - 1 - CORNER_PROBE
    },
    card: {
      x: left + middle,
      y: top + centerY
    },
    beside: {
      x: left - EDGE_PROBE,
      y: top + centerY
    },
    below: {
      x: left + middle,
      y: top + placed.height + EDGE_PROBE
    }
  };
}

function placeCommand(rectangle: Rectangle) {
  return {
    command: {
      cmd: "place",
      ...rectangle
    },
    kind: "place"
  };
}

function isCardShown(card: Color | undefined) {
  return card !== undefined && !isNear({
    color: card,
    expected: BRIGHT_GREEN
  });
}

// The window paints on its own schedule: reads again until the card shows, up
// to READ_ATTEMPTS times, and says whether it did.
async function settledRead({ rectangle, points, name }: {
  rectangle: Rectangle;
  points: Array<ReturnType<typeof probesOf>[ProbeName]>;
  name: string;
}) {
  const iCard = PROBE_NAMES.indexOf("card");
  await new Promise(resolve => setTimeout(resolve, SETTLE_MILLISECONDS));
  const savePath = path.join(CAPTURE_FOLDER, `${name}.png`);
  let read = screenCapture({
    rectangle,
    points,
    savePath
  });
  for (let iAttempt = 1; iAttempt < READ_ATTEMPTS && !isCardShown(read[iCard]); iAttempt++) {
    await new Promise(resolve => setTimeout(resolve, RETRY_MILLISECONDS));
    read = screenCapture({
      rectangle,
      points,
      savePath
    });
  }

  return {
    isShown: isCardShown(read[iCard]),
    colors: new Map(PROBE_NAMES.map((probe, iProbe) => [probe, read[iProbe]]))
  };
}

// What the screen shows at the probes with the window over the bright one
// that sits in the corner of `area`; null when something covers the bright
// window there, which it is when it does not read green at every probe before
// the window is put over it.
async function readOver({ example, area, name }: {
  example: ExampleProcess;
  area: Rectangle;
  name: string;
}) {
  const probes = probesOf({
    x: 0,
    y: 0,
    width: WINDOW_WIDTH,
    height: WINDOW_HEIGHT
  });
  const points = PROBE_NAMES.map(probe => probes[probe]);
  const rectangle = brightRectangleOf(area);
  const bright = await BrightWindow.open(rectangle);
  try {
    const bare = screenCapture({
      rectangle,
      points
    });
    const isUncovered = bare.every(color => isNear({
      color,
      expected: BRIGHT_GREEN
    }));
    if (!isUncovered) {
      return null;
    }

    const target = {
      x: rectangle.x + MARGIN_X,
      y: rectangle.y + MARGIN_Y,
      width: WINDOW_WIDTH,
      height: WINDOW_HEIGHT
    };
    const placed = await example.ask(placeCommand(target));
    assert.equal(placed["isVisible"], true, "the window reports it is shown");
    assert.deepEqual(boundsOf(placed), target, "the window is where it was placed");
    return await settledRead({
      rectangle,
      points,
      name
    });
  } finally {
    bright.close();
  }
}

// What the screen shows at points of the window and around it: the colors
// where the window showed over the bright one, or null with whether any
// display had a place the bright window stayed uncovered.
async function measure({ backdrop, name }: {
  backdrop: string;
  name: string;
}) {
  mkdirSync(CAPTURE_FOLDER, { recursive: true });
  const example = ExampleProcess.start({
    entry: "examples/transparent-window/main.ts",
    flags: ["--backdrop", backdrop],
    env: NOT_BACKGROUND
  });
  let hasUncoveredArea = false;
  try {
    await example.ask(
      placeCommand({
        x: FAR_AWAY,
        y: FAR_AWAY,
        width: WINDOW_WIDTH,
        height: WINDOW_HEIGHT
      })
    );
    for (const area of screenAreas()) {
      const reading = await readOver({
        example,
        area,
        name
      });
      const isUncovered = reading !== null;
      hasUncoveredArea = hasUncoveredArea || isUncovered;
      const isShown = isUncovered && reading.isShown;
      if (isShown) {
        return {
          colors: reading.colors,
          hasUncoveredArea
        };
      }
    }

    return {
      colors: null,
      hasUncoveredArea
    };
  } finally {
    await example.stop();
  }
}

const COVERED = "another window covers the bright one on every display, so the screen cannot be read";
const HIDDEN = "the bright window was uncovered but the example's window never showed over it on any display";

// The colors of a measure, or what to do when there are none: skip when the
// screen could not be read, fail when it could and the window was not there.
function colorsOf({ outcome, context }: {
  outcome: Awaited<ReturnType<typeof measure>>;
  context: TestContext;
}) {
  const { colors, hasUncoveredArea } = outcome;
  const isRead = colors !== null;
  if (isRead) {
    return colors;
  }

  if (hasUncoveredArea) {
    assert.fail(HIDDEN);
  }

  context.skip(COVERED);
  return null;
}

test("a transparent window shows the desktop around its card, with no frame, outline or shadow", {
  skip: !IS_WINDOWS_APP_SDK_RESTORED,
  timeout: TIMEOUT_MILLISECONDS
}, async context => {
  const colors = colorsOf({
    outcome: await measure({
      backdrop: "transparent",
      name: "transparent"
    }),
    context
  });
  const isUnread = colors === null;
  if (isUnread) {
    return;
  }

  for (const probe of ["corner", "topEdge", "farCorner"] as const) {
    const color = colorAt({
      colors,
      probe
    });
    assert.ok(
      isNear({
        color,
        expected: BRIGHT_GREEN
      }), `the window is clear at its ${probe}, so the bright window shows through: ${JSON.stringify(color)}`
    );
  }

  for (const probe of ["beside", "below"] as const) {
    const color = colorAt({
      colors,
      probe
    });
    assert.ok(
      isNear({
        color,
        expected: BRIGHT_GREEN
      }), `no shadow or outline round the window, ${probe} it: ${JSON.stringify(color)}`
    );
  }

  const card = colorAt({
    colors,
    probe: "card"
  });
  assert.ok(Math.max(card.r, card.g, card.b) <= CARD_DARK_MAXIMUM, `the card is dark: ${JSON.stringify(card)}`);
  assert.ok(card.g >= card.r + CARD_TINT_MINIMUM, `and 90 percent opaque, so a little of the green below shows in it: ${JSON.stringify(card)}`);
});

test("the same window with no backdrop is opaque where the transparent one is clear", {
  skip: !IS_WINDOWS_APP_SDK_RESTORED,
  timeout: TIMEOUT_MILLISECONDS
}, async context => {
  const colors = colorsOf({
    outcome: await measure({
      backdrop: "none",
      name: "none"
    }),
    context
  });
  const isUnread = colors === null;
  if (isUnread) {
    return;
  }

  const topEdge = colorAt({
    colors,
    probe: "topEdge"
  });
  assert.ok(
    !isNear({
      color: topEdge,
      expected: BRIGHT_GREEN
    }), `the theme's solid color covers the bright window, so the capture does tell a clear pixel from an opaque one: ${JSON.stringify(topEdge)}`
  );
});
