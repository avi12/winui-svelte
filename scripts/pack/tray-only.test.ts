import { exportAliases, ExportTarget } from "#scripts/export-aliases.ts";
import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import path from "node:path";
import { test } from "node:test";
import { build } from "vite";

// What a tray-only process ships: the notification-area icon, its popup menu
// and the call that starts or signals the app, and nothing of the component
// barrel or the window runtime. Bundled the way a consumer's build would,
// against the built package; dynwinrt stays external, as a native module.

const PACKAGE_ROOT = path.join(import.meta.dirname, "..", "..");
const ENTRY = path.join(import.meta.dirname, "treeshake-app", "tray-main.ts");
const IS_BUILT = existsSync(path.join(PACKAGE_ROOT, "dist"));
const BUNDLE_TIMEOUT_MILLISECONDS = 120_000;
const externalModule = new RegExp(String.raw`^#winui/|dist[\/]bindings|@microsoft[\/]dynwinrt`, "u");

// Measured: the whole bundle today. Lower it when the entry gets smaller;
// never raise it to make a change pass.
const BUDGET_BYTES = 15_000;
const WINDOW_RUNTIME_FOLDERS = ["components", "renderer", "window", "css"];
const COMPONENT_NAMES = ["NavigationView", "ComboBox", "TextBlock", "ScrollViewer", "MenuFlyout", "ContentDialog"];

async function bundle() {
  const result = await build({
    configFile: false,
    root: path.dirname(ENTRY),
    logLevel: "warn",
    resolve: {
      alias: exportAliases(ExportTarget.BUILT)
    },
    build: {
      write: false,
      ssr: true,
      minify: true,
      rollupOptions: {
        input: ENTRY,
        external: (id: string) => externalModule.test(id)
      }
    }
  });
  const outputs = Array.isArray(result) ? result : [result];
  const chunks = outputs
    .flatMap(output => "output" in output ? output.output : [])
    .flatMap(item => item.type === "chunk" ? [item] : []);
  return {
    code: chunks.map(chunk => chunk.code).join("\n"),
    sourceFiles: chunks.flatMap(chunk => Object.keys(chunk.modules))
  };
}

test("a tray-only process bundles no component and no window runtime", {
  skip: !IS_BUILT,
  timeout: BUNDLE_TIMEOUT_MILLISECONDS
}, async () => {
  const { code, sourceFiles } = await bundle();
  const bytes = Buffer.byteLength(code);
  console.log(`tray-only: ${bytes} bytes, ${sourceFiles.length} modules`);
  assert.ok(bytes <= BUDGET_BYTES, `${bytes} bytes is over the ${BUDGET_BYTES} budget`);

  const distFolder = path.join(PACKAGE_ROOT, "dist") + path.sep;
  const ownFiles = sourceFiles.filter(file => file.startsWith(distFolder)).map(file => file.slice(distFolder.length));
  const heavy = ownFiles.filter(file => WINDOW_RUNTIME_FOLDERS.includes(file.split(path.sep)[0] ?? ""));
  assert.deepEqual(heavy, [], "the window runtime or the components were bundled");

  const found = COMPONENT_NAMES.filter(name => code.includes(name));
  assert.deepEqual(found, [], "a component's name is in the bundle");
});
