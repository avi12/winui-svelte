import { IS_WINDOWS_APP_SDK_RESTORED } from "./example-process.ts";
import {
  isPackagedTestEnabled,
  PACKAGED_TEST_VARIABLE,
  runInTestPackage,
  withTestPackage
} from "./support/test-package.ts";
import type { TestPackageOptions } from "./support/test-package.ts";
import { win2dActivatableClasses } from "#src/win2d/manifest.js";
import assert from "node:assert/strict";
import { existsSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { test } from "node:test";
import { z } from "zod";

// Win2D in a process that has a package identity: the throwaway loose layout
// package of test/support/test-package.ts, a relay run under its identity, and
// the example it starts (examples/win2d-packaged: a CSS blur and a Canvas with
// a GaussianBlurEffect). A package's registration catalogue holds only what its
// manifest declares, so without the Win2D entries the class is not registered
// (0x80040154) and nothing is drawn; with the fragment of
// win2dActivatableClasses, and the library in the package, the canvas redraws
// and nothing is reported. It registers a package on this machine, so it runs
// only with WINUI_SVELTE_PACKAGED_TEST=1, in an ordinary desktop session.

const TIMEOUT_MILLISECONDS = 420_000;
const RUN_MILLISECONDS = 150_000;
const RELAY = path.join(import.meta.dirname, "win2d-packaged-relay.ts");
const LIBRARY_PATH = `bin/${process.arch}/Microsoft.Graphics.Canvas.dll`;
const NATIVE_LIBRARY = path.join(import.meta.dirname, "..", ".winapp", LIBRARY_PATH);
const NOT_REGISTERED = "0x80040154";

const answerSchema = z.object({
  stats: z.object({
    redraws: z.number(),
    runs: z.number()
  }).optional(),
  error: z.string().optional(),
  stderr: z.string()
});

async function runPackaged({ options, scratch, name }: {
  options: TestPackageOptions;
  scratch: string;
  name: string;
}) {
  const raw = await withTestPackage({
    options,
    use: testPackage => runInTestPackage({
      testPackage,
      run: {
        script: RELAY,
        resultFile: path.join(scratch, `${name}.json`),
        timeoutMilliseconds: RUN_MILLISECONDS
      }
    })
  });
  return answerSchema.parse(raw);
}

test(`Win2D activates in a packaged process only with its manifest entries (${PACKAGED_TEST_VARIABLE}=1)`, {
  skip: !isPackagedTestEnabled() || !IS_WINDOWS_APP_SDK_RESTORED || !existsSync(NATIVE_LIBRARY),
  timeout: TIMEOUT_MILLISECONDS
}, async () => {
  const scratch = mkdtempSync(path.join(tmpdir(), "winui-svelte-packaged-win2d-"));
  try {
    const without = await runPackaged({
      options: {},
      scratch,
      name: "without"
    });
    assert.ok(without.stderr.includes(NOT_REGISTERED), `a package without the entries must hit ${NOT_REGISTERED}: ${without.stderr}`);
    assert.ok((without.stats?.redraws ?? 0) === 0, "the canvas must not draw without the entries");
    const manifest = win2dActivatableClasses({ libraryPath: LIBRARY_PATH });
    const registered = await runPackaged({
      options: {
        files: {
          [LIBRARY_PATH]: NATIVE_LIBRARY
        },
        packageExtensions: manifest
      },
      scratch,
      name: "with"
    });
    assert.equal(registered.error, undefined);
    assert.ok((registered.stats?.redraws ?? 0) > 0, "the canvas never drew");
    assert.ok(!registered.stderr.includes(NOT_REGISTERED), registered.stderr);
    assert.equal(registered.stderr, "");
  } finally {
    rmSync(scratch, {
      recursive: true,
      force: true
    });
  }
});
