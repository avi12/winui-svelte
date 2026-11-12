import assert from "node:assert/strict";
import { test } from "node:test";

// The taskbar button over a stand-in for the shell: state mapping, value
// clamping, flash flags, and the badge as pixels.

const { flashCall, progressCall, thumbnailClipCall, thumbnailTooltipOf } = await import("./taskbar-calls.ts");
const { TaskbarButton, TaskbarFlashUntil, TaskbarProgressState, taskbarBadgeBackend } = await import("./taskbar.ts");
const { badgeDescription, badgeLabel, renderBadgeIcon } = await import("./badge-icon.ts");

const HWND = 42n;
const ICON_SIZE = 16;
const ALPHA_OFFSET = 3;
const BYTES_PER_PIXEL = 4;
const CORNER_OFFSET = 0;
const OPAQUE = 255;

function fakeShell() {
  const calls: string[] = [];
  let lastIcon: unknown = null;
  const backend = {
    smallIconSize: () => ICON_SIZE,
    setProgress: ({ state, completed, total }: {
      state: number;
      completed: bigint;
      total: bigint;
    }) => calls.push(`progress ${state} ${completed}/${total}`),
    setOverlay({ icon, description }: {
      icon: unknown;
      description: string;
    }) {
      lastIcon = icon;
      calls.push(`overlay ${icon === null ? "none" : "icon"} "${description}"`);
    },
    flash: ({ flags, count }: {
      flags: number;
      count: number;
    }) => calls.push(`flash ${flags} ${count}`),
    setThumbnailTooltip: ({ text }: { text: string }) => calls.push(`tooltip "${text}"`),
    setThumbnailClip: ({ rectangle }: { rectangle: object | null }) => calls.push(`clip ${JSON.stringify(rectangle)}`)
  };
  return {
    calls,
    backend,
    icon: () => lastIcon,
    button: new TaskbarButton({
      hwnd: HWND,
      backend
    })
  };
}

test("each state maps to its TBPF flag and the value clamps to completed over total", () => {
  assert.deepEqual(progressCall({ state: TaskbarProgressState.NONE }), {
    state: 0,
    completed: 0n,
    total: 1000n
  });
  assert.equal(progressCall({ state: TaskbarProgressState.INDETERMINATE }).state, 1);
  assert.equal(progressCall({ state: TaskbarProgressState.NORMAL }).state, 2);
  assert.equal(progressCall({ state: TaskbarProgressState.ERROR }).state, 4);
  assert.equal(progressCall({ state: TaskbarProgressState.PAUSED }).state, 8);
  assert.equal(
    progressCall({
      state: TaskbarProgressState.NORMAL,
      value: 0.25
    }).completed, 250n
  );
  assert.equal(
    progressCall({
      state: TaskbarProgressState.NORMAL,
      value: 7
    }).completed, 1000n
  );
  assert.equal(
    progressCall({
      state: TaskbarProgressState.NORMAL,
      value: -3
    }).completed, 0n
  );
});

test("a value that is not a number and an unknown state are TypeErrors", () => {
  assert.throws(
    () => progressCall({
      state: TaskbarProgressState.NORMAL,
      value: Number.NaN
    }), TypeError
  );
  assert.throws(() => progressCall({ state: "loud" as never }), TypeError);
});

test("a flash counts, runs until the foreground or until stopped", () => {
  const tray = 2;
  assert.deepEqual(flashCall({}), {
    flags: tray,
    count: 3
  });
  assert.deepEqual(
    flashCall({
      count: 5,
      until: TaskbarFlashUntil.COUNT
    }), {
      flags: tray,
      count: 5
    }
  );
  assert.deepEqual(flashCall({ until: TaskbarFlashUntil.FOREGROUND }), {
    flags: 0xE,
    count: 0
  });
  assert.deepEqual(flashCall({ until: TaskbarFlashUntil.STOPPED }), {
    flags: 6,
    count: 0
  });
  assert.throws(() => flashCall({ count: 0 }), TypeError);
});

test("the button sends its window and the mapped numbers to the shell", () => {
  const shell = fakeShell();
  shell.button.setProgress({
    state: TaskbarProgressState.ERROR,
    value: 0.5
  });
  shell.button.setOverlayIcon({
    icon: "app.ico",
    description: "sync"
  });
  shell.button.clearOverlay();
  shell.button.flash({ count: 2 });
  shell.button.stopFlashing();
  assert.deepEqual(shell.calls, [
    "progress 4 500/1000",
    "overlay icon \"sync\"",
    "overlay none \"\"",
    "flash 2 2",
    "flash 0 0"
  ]);
});

test("the badge label caps at 99+ and the description says what it is", () => {
  assert.equal(badgeLabel(7), "7");
  assert.equal(badgeLabel(99), "99");
  assert.equal(badgeLabel(100), "99+");
  assert.equal(badgeDescription({ count: 3 }), "3 unread");
  assert.equal(badgeDescription({ glyph: "busy" }), "busy");
});

test("a badge icon is a disc: clear in the corner, opaque near the middle", () => {
  for (const face of [{ count: 5 }, { count: 120 }, { glyph: "error" as const }, { glyph: "playing" as const }]) {
    const { size, bgra } = renderBadgeIcon({
      size: ICON_SIZE,
      face
    });
    assert.equal(size, ICON_SIZE);
    assert.equal(bgra.length, ICON_SIZE * ICON_SIZE * BYTES_PER_PIXEL);
    assert.equal(bgra[CORNER_OFFSET + ALPHA_OFFSET], 0, "the corner is clear");
    const rim = (ICON_SIZE / 2) * ICON_SIZE * BYTES_PER_PIXEL + 1 * BYTES_PER_PIXEL + ALPHA_OFFSET;
    assert.equal(bgra[rim], OPAQUE, "inside the disc is opaque");
  }
});

test("a count draws white digits on the red disc", () => {
  const { bgra } = renderBadgeIcon({
    size: ICON_SIZE,
    face: {
      count: 8
    }
  });
  const pixels = [...Array(ICON_SIZE * ICON_SIZE).keys()];
  const whites = pixels.filter(iPixel => {
    const offset = iPixel * BYTES_PER_PIXEL;
    return bgra[offset] === OPAQUE && bgra[offset + 1] === OPAQUE;
  });
  assert.ok(whites.length > 10, "the eight has lit pixels");
});

test("the badge backend maps count, glyph and clear to the overlay", () => {
  const shell = fakeShell();
  const backend = taskbarBadgeBackend(shell.button);
  backend.setCount(4);
  backend.setGlyph("alert");
  backend.setGlyph("none");
  backend.clear();
  assert.deepEqual(shell.calls, [
    "overlay icon \"4 unread\"",
    "overlay icon \"alert\"",
    "overlay none \"\"",
    "overlay none \"\""
  ]);
  assert.equal(shell.icon(), null);
});

test("the thumbnail tooltip passes through and its length is bounded", () => {
  const { button, calls } = fakeShell();
  button.setThumbnailTooltip("3 unread");
  button.setThumbnailTooltip("");
  assert.deepEqual(calls, ["tooltip \"3 unread\"", "tooltip \"\""]);
  assert.equal(thumbnailTooltipOf("x".repeat(259)).length, 259);
  assert.throws(() => button.setThumbnailTooltip("x".repeat(260)), RangeError);
});

test("the thumbnail clip becomes edges, null clears it, and a bad rectangle throws", () => {
  const { button, calls } = fakeShell();
  button.setThumbnailClip({
    x: 10,
    y: 20,
    width: 300,
    height: 100
  });
  button.setThumbnailClip(null);
  assert.deepEqual(calls, ["clip {\"left\":10,\"top\":20,\"right\":310,\"bottom\":120}", "clip null"]);
  for (const bad of [
    {
      x: -1,
      y: 0,
      width: 5,
      height: 5
    },
    {
      x: 0,
      y: 0,
      width: 0,
      height: 5
    },
    {
      x: 0.5,
      y: 0,
      width: 5,
      height: 5
    },
    {
      x: 0,
      y: 0,
      width: 5,
      height: Number.NaN
    }
  ]) {
    assert.throws(() => thumbnailClipCall(bad), TypeError);
  }
});
