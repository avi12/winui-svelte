import { writeRuntimeKit } from "./runtime-kit.ts";
import { BOOTSTRAPPER_NAME, bootstrapperFolderIn, catalogueFileIn } from "#src/runtime-files.js";
import assert from "node:assert/strict";
import { existsSync, mkdtempSync, rmSync } from "node:fs";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import path from "node:path";
import { test } from "node:test";

// What a built app reads at run time is written beside its bundle.

test("the kit carries the native module, the bootstrapper and the catalogue", () => {
  const outDirectory = mkdtempSync(path.join(tmpdir(), "winui-kit-"));
  try {
    writeRuntimeKit(outDirectory);
    assert.ok(existsSync(catalogueFileIn(outDirectory)), "the resource catalogue is missing");
    assert.ok(existsSync(path.join(bootstrapperFolderIn(outDirectory), BOOTSTRAPPER_NAME)), "the bootstrapper is missing");
    const native = createRequire(path.join(outDirectory, "main.js")).resolve("@microsoft/dynwinrt");
    assert.ok(native.startsWith(outDirectory), "the native module does not resolve to the output folder");
    assert.ok(existsSync(path.join(path.dirname(native), "vcruntime140.dll")), "the C runtime is not beside the native module");
  } finally {
    rmSync(outDirectory, {
      recursive: true,
      force: true
    });
  }
});
