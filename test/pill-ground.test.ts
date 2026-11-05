import type { Report } from "./example-process.ts";
import { ExampleProcess, IS_WINDOWS_APP_SDK_RESTORED, numberOf } from "./example-process.ts";
import { windowCapture } from "./window-pixels.ts";
import assert from "node:assert/strict";
import { mkdirSync } from "node:fs";
import path from "node:path";
import { test } from "node:test";

// The pill-ground example (examples/pill-ground): the Gemini Live pill on one
// transparent, borderless, tool, no-activate window that follows its content
// with the bottom-right corner pinned. It runs off screen and never activated
// (background mode), so what is read here is what Windows holds for the window
// and what PrintWindow draws of it. PrintWindow has no alpha: a transparent
// window is drawn over black, so "clear" is a pixel that reads black, told
// apart from an opaque black by the same window with `--backdrop mica`, whose
// corner shows the theme's solid color. Where the window sits on a display is
// not something this can show. Skipped where the Windows App SDK was not
// restored.

const TIMEOUT_MILLISECONDS = 300_000;
const LAYOUT_MILLISECONDS = 1200;
const CARD_LINES = 3;
const DOCK_INSET = 6;
const PILL_WIDTH = 504;
const PILL_HEIGHT = 48;
const GLOW_ROOM = 24;
const CARD_GAP_PROBE = 4;
const GLOW_PROBE = 4;
const CAPTURE_FOLDER = path.join(import.meta.dirname, "..", ".verify", "pill-ground");
const SOLID_CORNER_MINIMUM = 15;
const CLEAR_MAXIMUM = 3;
const PILL_MINIMUM = 15;
const GLOW_MINIMUM = 10;

// Black, give or take the faint tail of the glow's blur.
function isClear({ r, g, b }: {
  r: number;
  g: number;
  b: number;
}) {
  return Math.max(r, g, b) <= CLEAR_MAXIMUM;
}

function rectangleOf({ report, name }: {
  report: Report;
  name: string;
}) {
  const rectangle = report[name];
  assert.ok(typeof rectangle === "object" && rectangle !== null && !Array.isArray(rectangle), `the report carries ${name}`);
  function field(side: string) {
    return numberOf({
      report: rectangle,
      field: side
    });
  }

  return {
    x: field("x"),
    y: field("y"),
    width: field("width"),
    height: field("height")
  };
}

function boundsOf(report: Report) {
  return rectangleOf({
    report,
    name: "bounds"
  });
}

async function settledInfo(example: ExampleProcess) {
  await new Promise(resolve => setTimeout(resolve, LAYOUT_MILLISECONDS));
  return example.ask({
    command: {
      cmd: "info"
    },
    kind: "info"
  });
}

function showContent({ example, lines }: {
  example: ExampleProcess;
  lines: number;
}) {
  return example.ask({
    command: {
      cmd: "content",
      lines
    },
    kind: "content"
  });
}

test("the pill is one transparent window whose card grows upward with the corner pinned", {
  skip: !IS_WINDOWS_APP_SDK_RESTORED,
  timeout: TIMEOUT_MILLISECONDS
}, async () => {
  mkdirSync(CAPTURE_FOLDER, { recursive: true });
  const example = ExampleProcess.start({ entry: "examples/pill-ground/main.ts" });
  try {
    const opened = await example.ask({
      command: {
        cmd: "info"
      },
      kind: "info"
    });
    assert.equal(opened["isNoActivate"], true, "the pill never takes focus");
    assert.equal(opened["isToolWindow"], true, "the pill has no taskbar button");
    assert.equal(opened["hasBorder"], false, "the pill has no frame");

    await showContent({
      example,
      lines: 0
    });
    const bare = await settledInfo(example);
    const scale = numberOf({
      report: bare,
      field: "scale"
    });
    const before = boundsOf(bare);
    const workArea = rectangleOf({
      report: bare,
      name: "workArea"
    });
    assert.equal(
      workArea.x + workArea.width - (before.x + before.width), DOCK_INSET, "docked: the right edge is 6 device pixels from the work area of the display the window is on"
    );
    assert.equal(
      workArea.y + workArea.height - (before.y + before.height), DOCK_INSET, "docked: the bottom edge is 6 device pixels above the work area's bottom"
    );
    assert.equal(
      before.width, Math.round(PILL_WIDTH * scale), "504 device-independent pixels wide: no frame takes any of it"
    );
    assert.equal(
      before.height, Math.round((PILL_HEIGHT + GLOW_ROOM) * scale), "with no card the window is the pill and the room under it for the glow, with no frame around them"
    );

    await showContent({
      example,
      lines: CARD_LINES
    });
    const grown = boundsOf(await settledInfo(example));
    assert.ok(grown.height > before.height, "the card makes the window taller");
    assert.equal(grown.width, before.width, "height mode keeps the width");
    assert.equal(grown.x + grown.width, before.x + before.width, "the right edge stays");
    assert.equal(grown.y + grown.height, before.y + before.height, "the bottom edge stays: the window grew upward");

    const glowRoom = Math.round(GLOW_ROOM * scale);
    const pillHeight = Math.round(PILL_HEIGHT * scale);
    const pillTop = grown.height - glowRoom - pillHeight;
    const middle = Math.round(grown.width / 2);
    const [gap, inPill, inGlow, corner] = windowCapture({
      pid: example.pid,
      points: [
        {
          x: middle,
          y: pillTop - Math.round(CARD_GAP_PROBE * scale)
        },
        {
          x: middle,
          y: pillTop + Math.round(pillHeight / 2)
        },
        {
          x: middle,
          y: pillTop + pillHeight + Math.round(GLOW_PROBE * scale)
        },
        {
          x: 1,
          y: 1
        }
      ],
      savePath: path.join(CAPTURE_FOLDER, "pill-with-card.png")
    });
    assert.ok(gap !== undefined && inPill !== undefined && inGlow !== undefined && corner !== undefined);
    assert.ok(isClear(gap), `the gap between the card and the pill is clear: ${JSON.stringify(gap)}`);
    assert.ok(isClear(corner), `the top corner of the window, outside the card's rounded corner, is clear: ${JSON.stringify(corner)}`);
    assert.ok(inPill.r + inPill.g + inPill.b >= PILL_MINIMUM, `the pill is drawn: ${JSON.stringify(inPill)}`);
    assert.ok(
      inGlow.r + inGlow.g + inGlow.b >= GLOW_MINIMUM,
      `the glow bleeds past the pill into the area under it: ${JSON.stringify(inGlow)}`
    );

    await showContent({
      example,
      lines: 0
    });
    const shrunk = boundsOf(await settledInfo(example));
    assert.equal(shrunk.height, before.height, "no card shrinks the window back");
    assert.equal(shrunk.y + shrunk.height, before.y + before.height, "and the corner is still where it was");

    example.send({ cmd: "close" });
    assert.equal(await example.exited, 0, "closing the window ends the example");
  } finally {
    example.kill();
  }
});

test("the same window with a mica backdrop shows the theme color where the transparent one is clear", {
  skip: !IS_WINDOWS_APP_SDK_RESTORED,
  timeout: TIMEOUT_MILLISECONDS
}, async () => {
  mkdirSync(CAPTURE_FOLDER, { recursive: true });
  const example = ExampleProcess.start({
    entry: "examples/pill-ground/main.ts",
    flags: ["--backdrop", "mica"]
  });
  try {
    await showContent({
      example,
      lines: 0
    });
    const bare = await settledInfo(example);
    const { width } = boundsOf(bare);
    const [corner] = windowCapture({
      pid: example.pid,
      points: [{
        x: width - 1,
        y: 1
      }],
      savePath: path.join(CAPTURE_FOLDER, "pill-solid.png")
    });
    assert.ok(corner !== undefined);
    assert.ok(corner.r + corner.g + corner.b >= SOLID_CORNER_MINIMUM, `a window with a material paints its theme color there: ${JSON.stringify(corner)}`);

    example.send({ cmd: "close" });
    assert.equal(await example.exited, 0, "closing the window ends the example");
  } finally {
    example.kill();
  }
});
