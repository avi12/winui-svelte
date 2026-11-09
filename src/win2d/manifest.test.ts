import { win2dActivatableClasses, win2dClassNames } from "./manifest.ts";
import assert from "node:assert/strict";
import { test } from "node:test";

test("the fragment lists one ActivatableClass per class in one InProcessServer", () => {
  const fragment = win2dActivatableClasses({
    libraryPath: "bin/x64/Microsoft.Graphics.Canvas.dll",
    classes: ["Microsoft.Graphics.Canvas.Effects.GaussianBlurEffect", "Microsoft.Graphics.Canvas.CanvasDevice"]
  });
  assert.match(fragment, /^<Extension Category="windows\.activatableClass\.inProcessServer">/);
  assert.ok(fragment.includes("<Path>bin\\x64\\Microsoft.Graphics.Canvas.dll</Path>"));
  assert.equal(fragment.match(/<ActivatableClass /g)?.length, 2);
  assert.equal(fragment.match(/<InProcessServer>/g)?.length, 1);
  assert.ok(fragment.includes("ActivatableClassId=\"Microsoft.Graphics.Canvas.Effects.GaussianBlurEffect\" ThreadingModel=\"both\""));
});

test("by default every Win2D class the bindings activate is listed", () => {
  const names = win2dClassNames();
  assert.ok(names.includes("Microsoft.Graphics.Canvas.Effects.GaussianBlurEffect"));
  assert.ok(names.includes("Microsoft.Graphics.Canvas.Text.CanvasTextFormat"));
  assert.ok(names.every(name => name.startsWith("Microsoft.Graphics.Canvas.")));
  const fragment = win2dActivatableClasses({ libraryPath: "bin/x64/Microsoft.Graphics.Canvas.dll" });
  assert.equal(fragment.match(/<ActivatableClass /g)?.length, names.length);
});
