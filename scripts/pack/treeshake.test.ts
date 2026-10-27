import { exportAliases, ExportTarget } from "#scripts/export-aliases.ts";
import { winuiSvelte } from "#src/vite/plugin.js";
import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import path from "node:path";
import { test } from "node:test";
import { build } from "vite";

// What an app that uses one component ships. The app (treeshake-app) is bundled
// the way a consumer's build would, against the built package (dist); the
// bindings and dynwinrt stay external, as native modules Node loads itself.
//
// A bundler can only drop what the package lets it: `sideEffects: false`, ESM
// and no import-time work. The first test holds the line against growth. The
// second is the goal: a Button must not import the bindings of every control.

const PACKAGE_ROOT = path.join(import.meta.dirname, "..", "..");
const APP_FOLDER = path.join(import.meta.dirname, "treeshake-app");
const IS_BUILT = existsSync(path.join(PACKAGE_ROOT, "dist"));
const BUNDLE_TIMEOUT_MILLISECONDS = 120_000;
const bindingImport = /#winui\/[\w./-]+/gu;
const externalModule = new RegExp(String.raw`^#winui/|@winapp[\\/]bindings|\.winapp[\\/]bindings|@microsoft[\\/]dynwinrt`, "u");

// Measured with one <Button>: today's bundle. Lower it when the package gets
// smaller; never raise it to make a change pass.
const BUDGET_BYTES = 130_000;
const BUDGET_BINDINGS = 340;
// What the goal allows: the bindings of the controls and enums the app uses,
// and the renderer's own handful.
const GOAL_BINDINGS = 40;

async function bundleOfOneButton() {
  const result = await build({
    configFile: false,
    root: APP_FOLDER,
    logLevel: "warn",
    plugins: [winuiSvelte()],
    resolve: {
      alias: exportAliases(ExportTarget.Built)
    },
    build: {
      write: false,
      minify: true,
      rollupOptions: {
        input: "main.ts",
        external: (id: string) => externalModule.test(id)
      }
    }
  });
  const outputs = Array.isArray(result) ? result : [result];
  const chunks = outputs.flatMap(output => "output" in output ? output.output : []).flatMap(item => item.type === "chunk" ? [item] : []);
  const code = chunks.map(chunk => chunk.code).join("\n");
  return {
    bytes: Buffer.byteLength(code),
    bindings: new Set(code.match(bindingImport) ?? []).size
  };
}

test("an app with one Button stays within the bundle budget", {
  skip: !IS_BUILT,
  timeout: BUNDLE_TIMEOUT_MILLISECONDS
}, async () => {
  const bundle = await bundleOfOneButton();
  assert.ok(bundle.bytes <= BUDGET_BYTES, `${bundle.bytes} bytes is over the ${BUDGET_BYTES} budget`);
  assert.ok(bundle.bindings <= BUDGET_BINDINGS, `${bundle.bindings} binding imports is over the ${BUDGET_BINDINGS} budget`);
});

test("an app with one Button imports only the bindings it uses", {
  skip: !IS_BUILT,
  timeout: BUNDLE_TIMEOUT_MILLISECONDS,
  todo: "every generated component imports the bindings of all controls through runtime.ts"
}, async () => {
  const bundle = await bundleOfOneButton();
  assert.ok(bundle.bindings <= GOAL_BINDINGS, `${bundle.bindings} binding imports for one Button, the goal is ${GOAL_BINDINGS}`);
});
