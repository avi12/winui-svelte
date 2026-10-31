import { exportAliases, ExportTarget } from "#scripts/export-aliases.ts";
import { winuiSvelte } from "#src/vite/plugin.js";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { test } from "node:test";
import { build } from "vite";

// What an app that uses one component ships. The app (treeshake-app) is bundled
// the way a consumer's build would, against the built package (dist); the
// bindings and dynwinrt stay external, as native modules Node loads itself.
//
// A bundler can only drop what the package lets it: `sideEffects: false`, ESM
// and no import-time work. The first test holds the line against growth and
// the bindings a Button imports; the third shows how an app of five controls
// grows. What an app loads at start is its entry chunk: the attached
// properties (Canvas.Left, ScrollViewer.ZoomMode, AutomationProperties.Name)
// load their owner's bindings the first time one is set, in chunks of their
// own, and a Button's app never fetches them.

const PACKAGE_ROOT = path.join(import.meta.dirname, "..", "..");
const APP_FOLDER = path.join(import.meta.dirname, "treeshake-app");
const IS_BUILT = existsSync(path.join(PACKAGE_ROOT, "dist"));
const BUNDLE_TIMEOUT_MILLISECONDS = 120_000;
const bindingImport = /#winui\/[\w./-]+/gu;
const externalModule = new RegExp(String.raw`^#winui/|dist[\\/]bindings|@microsoft[\\/]dynwinrt`, "u");

// Measured with one <Button>: the entry chunk today. Lower it when the package
// gets smaller; never raise it to make a change pass.
const BUDGET_BYTES = 120_800;
// The bindings of the Button, the enums its properties take and the renderer's
// own handful. Lower it when an import goes; never raise it.
const BUDGET_BINDINGS = 29;
// What five controls (a panel, two inputs, a check box and a Button) may add
// to one Button.
const BUDGET_FIVE_EXTRA_BYTES = 24_000;

// What importing one enum may add to an app: the import of its bindings
// module and the expression that reads it, never the other enums.
const ONE_ENUM_BYTES = 200;
const ENUMS_FILE = path.join(PACKAGE_ROOT, "src", "components", "generated", "enums.ts");
const enumModule = /from "(#winui\/[\w./-]+)"/gu;

async function bundleOf(input: string) {
  const result = await build({
    configFile: false,
    root: APP_FOLDER,
    logLevel: "warn",
    plugins: [winuiSvelte()],
    resolve: {
      alias: exportAliases(ExportTarget.BUILT)
    },
    build: {
      write: false,
      minify: true,
      rollupOptions: {
        input,
        external: (id: string) => externalModule.test(id)
      }
    }
  });
  const outputs = Array.isArray(result) ? result : [result];
  const items = outputs.flatMap(output => "output" in output ? output.output : []);
  const chunks = items.flatMap(item => item.type === "chunk" ? [item] : []).filter(chunk => chunk.isEntry);
  const code = chunks.map(chunk => chunk.code).join("\n");
  return {
    bytes: Buffer.byteLength(code),
    modules: new Set(code.match(bindingImport) ?? []),
    sourceFiles: chunks.flatMap(chunk => Object.entries(chunk.modules)
      .filter(([, rendered]) => rendered.renderedLength > 0)
      .map(([id]) => id))
  };
}

async function bundleOfOneButton() {
  const bundle = await bundleOf("main.ts");
  return {
    ...bundle,
    bindings: bundle.modules.size
  };
}

test("an app with one Button stays within the bundle budget", {
  skip: !IS_BUILT,
  timeout: BUNDLE_TIMEOUT_MILLISECONDS
}, async () => {
  const bundle = await bundleOfOneButton();
  console.log(`one Button: ${bundle.bytes} bytes, ${bundle.bindings} binding imports`);
  assert.ok(bundle.bytes <= BUDGET_BYTES, `${bundle.bytes} bytes is over the ${BUDGET_BYTES} budget`);
});

test("an app with one Button imports only the bindings it uses", {
  skip: !IS_BUILT,
  timeout: BUNDLE_TIMEOUT_MILLISECONDS
}, async () => {
  const bundle = await bundleOfOneButton();
  assert.ok(bundle.bindings <= BUDGET_BINDINGS, `${bundle.bindings} binding imports for one Button, the budget is ${BUDGET_BINDINGS}`);
});

test("five controls cost little more than one", {
  skip: !IS_BUILT,
  timeout: BUNDLE_TIMEOUT_MILLISECONDS
}, async () => {
  const [button, five] = await Promise.all([bundleOf("main.ts"), bundleOf("five-main.ts")]);
  console.log(`one Button: ${button.bytes} bytes; five controls: ${five.bytes} bytes, ${five.modules.size} binding imports`);
  assert.ok(five.bytes - button.bytes <= BUDGET_FIVE_EXTRA_BYTES, `five controls added ${five.bytes - button.bytes} bytes`);
});

// The same Button, importing one enum's value and another's type from
// winui-svelte/enums: the type erases, and the value brings its module alone.
test("an app bundles only the enums it imports from winui-svelte/enums", {
  skip: !IS_BUILT,
  timeout: BUNDLE_TIMEOUT_MILLISECONDS
}, async () => {
  const [button, withEnum] = await Promise.all([bundleOf("main.ts"), bundleOf("enum-main.ts")]);
  const enumModules = new Set([...readFileSync(ENUMS_FILE, "utf8").matchAll(enumModule)].map(match => match[1]));
  const added = [...withEnum.modules].filter(module => !button.modules.has(module));
  const addedEnums = added.filter(module => enumModules.has(module));
  console.log(`one Button: ${button.bytes} bytes; with one enum imported: ${withEnum.bytes} bytes`);
  assert.deepEqual(addedEnums, ["#winui/microsoft/ui/xaml/controls/AppBarClosedDisplayMode"]);
  assert.deepEqual(added, addedEnums);
  assert.ok(withEnum.bytes - button.bytes <= ONE_ENUM_BYTES, `one enum added ${withEnum.bytes - button.bytes} bytes`);
});

// The Web APIs are opt-in: an app that installs none must not carry one.
test("an app with one Button bundles no Web API code", {
  skip: !IS_BUILT,
  timeout: BUNDLE_TIMEOUT_MILLISECONDS
}, async () => {
  const bundle = await bundleOf("main.ts");
  const webApiFiles = bundle.sourceFiles.filter(file => /[/]web-apis[/]/u.test(file));
  assert.deepEqual(webApiFiles, []);
});
