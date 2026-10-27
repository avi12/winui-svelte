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

const packageRoot = path.join(import.meta.dirname, "..", "..");
const appFolder = path.join(import.meta.dirname, "treeshake-app");
const isBuilt = existsSync(path.join(packageRoot, "dist"));
const bundleTimeoutMilliseconds = 120_000;
const bindingImport = /#winui\/[\w./-]+/gu;
const externalModule = new RegExp(String.raw`^#winui/|@winapp[\\/]bindings|\.winapp[\\/]bindings|@microsoft[\\/]dynwinrt`, "u");

// Measured with one <Button>: today's bundle. Lower it when the package gets
// smaller; never raise it to make a change pass.
const budgetBytes = 130_000;
const budgetBindings = 340;
// What the goal allows: the bindings of the controls and enums the app uses,
// and the renderer's own handful.
const goalBindings = 40;

async function bundleOfOneButton() {
  const result = await build({
    configFile: false,
    root: appFolder,
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
  skip: !isBuilt,
  timeout: bundleTimeoutMilliseconds
}, async () => {
  const bundle = await bundleOfOneButton();
  assert.ok(bundle.bytes <= budgetBytes, `${bundle.bytes} bytes is over the ${budgetBytes} budget`);
  assert.ok(bundle.bindings <= budgetBindings, `${bundle.bindings} binding imports is over the ${budgetBindings} budget`);
});

test("an app with one Button imports only the bindings it uses", {
  skip: !isBuilt,
  timeout: bundleTimeoutMilliseconds,
  todo: "every generated component imports the bindings of all controls through runtime.ts"
}, async () => {
  const bundle = await bundleOfOneButton();
  assert.ok(bundle.bindings <= goalBindings, `${bundle.bindings} binding imports for one Button, the goal is ${goalBindings}`);
});
