import { ExampleProcess, IS_WINDOWS_APP_SDK_RESTORED, numberOf } from "./example-process.ts";
import { exportAliases, ExportTarget } from "#scripts/export-aliases.ts";
import { filesIn } from "#scripts/files-in.ts";
import { buildApp } from "#src/vite/build.js";
import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import path from "node:path";
import { test } from "node:test";

// The production path: the production example (examples/production) built to
// a bundle by `buildApp` and run under plain Node, with no Vite dev server and
// no Svelte compiler, in a real WinUI window off screen. The window shows the
// host's state (the package's rune modules, compiled into the bundle), labels
// a control by reference and styles a ComboBox's items by class, which a
// minifier would break by renaming classes. Run through `pnpm test:windows`.

const PACKAGE_ROOT = path.join(import.meta.dirname, "..");
const EXAMPLE_FOLDER = path.join(PACKAGE_ROOT, "examples", "production");
// Under the package, so the bundle finds node_modules/@microsoft/dynwinrt above it.
const OUTPUT_PARENT = path.join(PACKAGE_ROOT, ".verify", "production-build");
const TIMEOUT_MILLISECONDS = 300_000;
// What a bundle for Node alone must not reach for at start.
const compilerImport = /from\s*["'](?:svelte\/compiler|vite)["']/u;
const runeCall = /=\s*\$state\(/u;

async function buildExample({ isMinified }: { isMinified: boolean }) {
  mkdirSync(OUTPUT_PARENT, { recursive: true });
  const outDirectory = mkdtempSync(path.join(OUTPUT_PARENT, isMinified ? "minified-" : "plain-"));
  await buildApp({
    root: PACKAGE_ROOT,
    entries: {
      main: path.join(EXAMPLE_FOLDER, "main.ts"),
      window: path.join(EXAMPLE_FOLDER, "window.ts")
    },
    outDirectory,
    isMinified,
    config: {
      resolve: {
        alias: exportAliases(ExportTarget.BUILT)
      }
    }
  });
  return outDirectory;
}

for (const isMinified of [false, true]) {
  test(`the example built ${isMinified ? "minified" : "unminified"} runs under plain Node`, {
    skip: !IS_WINDOWS_APP_SDK_RESTORED,
    timeout: TIMEOUT_MILLISECONDS
  }, async () => {
    const outDirectory = await buildExample({ isMinified });
    try {
      const sources = filesIn(outDirectory).filter(file => file.endsWith(".js")).map(file => readFileSync(file, "utf8"));
      assert.ok(sources.every(source => !compilerImport.test(source)), "the bundle imports the Svelte compiler or Vite");
      assert.ok(sources.every(source => !runeCall.test(source)), "a rune module was left uncompiled");

      const example = ExampleProcess.startBundle({ file: path.join(outDirectory, "main.js") });
      try {
        const opened = await example.ask({
          command: {
            cmd: "none"
          },
          kind: "view",
          isWanted: report => report["count"] === 0 && report["isLabelled"] === true
        });
        assert.equal(
          numberOf({
            report: opened,
            field: "count"
          }), 0
        );
        await example.ask({
          command: {
            cmd: "increment"
          },
          kind: "view",
          isWanted: report => report["count"] === 1
        });
        assert.equal(await example.stop(), true, "the app did not leave when its window closed");
        assert.equal(await example.exited, 0);
      } finally {
        example.kill();
      }
    } finally {
      rmSync(outDirectory, {
        recursive: true,
        force: true
      });
    }
  });
}
