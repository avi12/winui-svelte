import { ExampleProcess, IS_WINDOWS_APP_SDK_RESTORED, numberOf } from "./example-process.ts";
import { virtualScreen } from "#src/window/native.js";
import assert from "node:assert/strict";
import { test } from "node:test";

// The window example (examples/window) in a real WinUI window, off screen and
// never activated: <Window> with a custom title bar, each backdrop read back
// from WinUI, and its props followed live. Skipped where the Windows App SDK
// was not restored. (examples/window/run.ps1 captures each backdrop.)

const TIMEOUT_MILLISECONDS = 300_000;
const OPENED_WIDTH = 520;
const OPENED_HEIGHT = 360;
const MINIMUM_WIDTH = 400;
const WIDENED_TO = 600;

test("a window opens as its props say, follows them, and reports what happens to it", {
  skip: !IS_WINDOWS_APP_SDK_RESTORED,
  timeout: TIMEOUT_MILLISECONDS
}, async () => {
  const example = ExampleProcess.start({ entry: "examples/window/main.ts" });
  try {
    const opened = await example.ask({
      command: {
        cmd: "info"
      },
      kind: "info"
    });
    const scale = numberOf({
      report: opened,
      field: "scale"
    });
    assert.equal(opened["title"], "Window example");
    assert.equal(opened["extendsIntoTitleBar"], true, "a title bar snippet extends the content into the title bar");
    assert.equal(opened["backdrop"], "acrylic");
    assert.equal(opened["isMaximizable"], false);
    assert.equal(
      numberOf({
        report: opened,
        field: "width"
      }), Math.round(OPENED_WIDTH * scale)
    );
    assert.equal(
      numberOf({
        report: opened,
        field: "height"
      }), Math.round(OPENED_HEIGHT * scale)
    );
    assert.equal(
      numberOf({
        report: opened,
        field: "minimumWidth"
      }), Math.round(MINIMUM_WIDTH * scale)
    );
    const rightEdge = numberOf({
      report: opened,
      field: "x"
    }) + numberOf({
      report: opened,
      field: "width"
    });
    assert.ok(rightEdge <= virtualScreen().left, "the window opened left of every display");
    assert.equal(
      numberOf({
        report: opened,
        field: "activations"
      }), 0, "activate={false} opens without taking focus"
    );

    for (const backdrop of ["mica", "micaAlt", "none", "acrylic"]) {
      const changed = await example.ask({
        command: {
          cmd: "backdrop",
          value: backdrop
        },
        kind: "backdrop"
      });
      assert.equal(changed["backdrop"], backdrop, `WinUI holds ${String(changed["backdrop"])}, not ${backdrop}`);
    }

    // The controller's variants take the XAML backdrop away: the material is
    // the controller's, which WinUI does not hand back; transparent is a
    // clear composition brush on the window, which XAML does not report.
    for (const backdrop of ["acrylicBase", "acrylicThin", "transparent"]) {
      const changed = await example.ask({
        command: {
          cmd: "backdrop",
          value: backdrop
        },
        kind: "backdrop"
      });
      assert.equal(changed["backdrop"], "none", `${backdrop} leaves no XAML backdrop on the window`);
      assert.equal(
        changed["backdropBrushAlpha"], backdrop === "transparent" ? 0 : null, `${backdrop}: only the transparent backdrop is a clear color brush`
      );
    }

    const dark = await example.ask({
      command: {
        cmd: "theme",
        value: "dark"
      },
      kind: "theme"
    });
    assert.equal(dark["theme"], "Dark", "the theme prop sets the content's requested theme");
    const tall = await example.ask({
      command: {
        cmd: "titleBarHeight",
        value: "tall"
      },
      kind: "titleBarHeight"
    });
    assert.equal(tall["titleBarHeightOption"], "Tall");
    const hidden = await example.ask({
      command: {
        cmd: "iconShowOptions",
        value: "hideIconAndSystemMenu"
      },
      kind: "iconShowOptions"
    });
    assert.equal(hidden["iconShowOptions"], "HideIconAndSystemMenu", "the iconShowOptions prop reaches the title bar");
    const titleBarOverlay = hidden["overlay"];
    assert.ok(typeof titleBarOverlay === "object" && titleBarOverlay !== null && !Array.isArray(titleBarOverlay));
    assert.equal(titleBarOverlay["visible"], true, "the content extends into the title bar");
    const rect = titleBarOverlay["rect"];
    assert.ok(typeof rect === "object" && rect !== null && !Array.isArray(rect));
    assert.ok(Number(rect["width"]) > 0 && Number(rect["height"]) > 0, "the area the content may use has a size");
    const colored = await example.ask({
      command: {
        cmd: "captionButtons",
        foreground: "#ff0000",
        hoverBackground: "#80112233"
      },
      kind: "captionButtons"
    });
    assert.deepEqual(colored["captionForeground"], {
      a: 255,
      r: 255,
      g: 0,
      b: 0
    });
    assert.deepEqual(colored["captionHoverBackground"], {
      a: 128,
      r: 17,
      g: 34,
      b: 51
    });
    const uncolored = await example.ask({
      command: {
        cmd: "captionButtons",
        value: null
      },
      kind: "captionButtons"
    });
    assert.equal(uncolored["captionForeground"], null, "dropping the prop puts the system's color back");
    const dragged = await example.ask({
      command: {
        cmd: "dragRegions",
        x: 10,
        width: 200,
        height: 30
      },
      kind: "dragRegions"
    });
    assert.deepEqual(dragged["dragRegions"], [
      {
        x: Math.round(10 * scale),
        y: 0,
        width: Math.round(200 * scale),
        height: Math.round(30 * scale)
      }
    ], "a drag region is the caption region, in device pixels");

    const overlay = await example.ask({
      command: {
        cmd: "presentation",
        value: "compactOverlay"
      },
      kind: "presentation"
    });
    assert.equal(overlay["presentation"], "CompactOverlay");
    const windowed = await example.ask({
      command: {
        cmd: "presentation",
        value: "windowed"
      },
      kind: "presentation"
    });
    assert.equal(windowed["presentation"], "Overlapped");
    assert.equal(
      numberOf({
        report: windowed,
        field: "minimumWidth"
      }), Math.round(MINIMUM_WIDTH * scale), "back to windowed, the size limits are set again"
    );

    const retitled = await example.ask({
      command: {
        cmd: "title",
        value: "Another title"
      },
      kind: "title"
    });
    assert.equal(retitled["title"], "Another title");

    const widened = await example.ask({
      command: {
        cmd: "width",
        value: WIDENED_TO
      },
      kind: "width"
    });
    assert.equal(
      numberOf({
        report: widened,
        field: "width"
      }), Math.round(WIDENED_TO * scale), "a new width prop resizes the window"
    );
    const moved = await example.ask({
      command: {
        cmd: "move",
        x: -7000,
        y: 50
      },
      kind: "moved"
    });
    assert.equal(
      numberOf({
        report: moved,
        field: "x"
      }), -7000
    );
    assert.ok(
      numberOf({
        report: moved,
        field: "boundsReports"
      }) >= 2, "onBoundsChanged heard the resize and the move"
    );
    assert.deepEqual(moved["lastBounds"], {
      x: -7000,
      y: 50,
      width: Math.round(WIDENED_TO * scale),
      height: Math.round(OPENED_HEIGHT * scale)
    });

    const owned = await example.ask({
      command: {
        cmd: "openOwned"
      },
      kind: "owned"
    });
    assert.equal(owned["ownerId"], owned["expectedOwnerId"], "createWindow's owner is the window's owner");

    await example.ask({
      command: {
        cmd: "blockClose",
        value: true
      },
      kind: "blockClose"
    });
    const refused = await example.ask({
      command: {
        cmd: "tryClose"
      },
      kind: "closeTried"
    });
    assert.equal(
      numberOf({
        report: refused,
        field: "closeRequests"
      }), 1, "onClosing is asked when the window is closed"
    );
    assert.equal(
      numberOf({
        report: refused,
        field: "closes"
      }), 0, "onClosing returning true keeps the window open"
    );
    await example.ask({
      command: {
        cmd: "blockClose",
        value: false
      },
      kind: "blockClose"
    });

    example.send({ cmd: "close" });
    assert.equal(await example.exited, 0, "closing the window ends the example");
  } finally {
    example.kill();
  }
});
