import { exportAliases, ExportTarget } from "#scripts/export-aliases.ts";
import { buildTray } from "#src/vite/entrypoints/build-tray.js";
import assert from "node:assert/strict";
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync
} from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { test } from "node:test";

// What the build of a tray written as markup ships: tray.svelte is lowered to
// plain code at build, so tray.js holds no Svelte runtime and is about as
// large as the same tray written by hand in tray.ts. Both are built from the
// example, minified, against the built package.

const PACKAGE_ROOT = path.join(import.meta.dirname, "..", "..");
const EXAMPLE_ROOT = path.join(PACKAGE_ROOT, "examples", "tray-entrypoint-svelte");
const MARKUP_FILE = path.join(EXAMPLE_ROOT, "entrypoints", "tray.svelte");
const ICON_FILE = path.join(EXAMPLE_ROOT, "entrypoints", "tray.ico");
const IS_BUILT = existsSync(path.join(PACKAGE_ROOT, "dist"));
const BUILD_TIMEOUT_MILLISECONDS = 120_000;

// Measured: tray.js of the example today. Lower it when the bundle gets
// smaller; never raise it to make a change pass.
const BUDGET_BYTES = 97_400;

// What lowering may add over the hand-written form: the menu function and
// its spreads.
const SLACK_BYTES = 400;
const FORBIDDEN_PATTERNS = [
  /(?<![-\w])svelte\//u,
  /\$\$|mount\(|createComponent|Symbol\("\$state|NavigationView|ComboBox|ScrollViewer|ContentDialog/u
];

const HAND_WRITTEN = `import { activateOrLaunch, defineTray, MenuItemKind, MenuLevel, resolveMenu } from "winui-svelte/tray/standalone";

const APP_KEY = "tray-entrypoint-svelte-example";
const RECENT_COUNT = 3;
let isAutostart = false;

function openApp() {
  void activateOrLaunch({
    key: APP_KEY,
    activation: { arguments: [], workingDirectory: "." },
    launch: { command: process.execPath, arguments: ["main.js"] }
  });
}

function toggleAutostart() {
  isAutostart = !isAutostart;
}

function recentCaptures() {
  return Array.from({ length: RECENT_COUNT }, (_, iCapture) => \`capture-\${iCapture + 1}.png\`);
}

export default defineTray({
  icon: "tray.ico",
  tooltip: "Tray entrypoint (Svelte) example",
  guid: "3b0e8f4a-6c52-4d1e-9a77-5c1d2e8b4f90",
  onactivate: openApp,
  resolve: resolveMenu,
  menu: () => [
    { kind: MenuItemKind.HEADER, id: "title", label: "Recorder" },
    { kind: MenuItemKind.COMMAND, id: "open", label: "Open", isRequired: true, onselect: openApp },
    { kind: MenuItemKind.COMMAND, id: "capture", label: "Capture region", level: MenuLevel.STANDARD },
    { kind: MenuItemKind.COMMAND, id: "record", label: "Record screen", level: MenuLevel.FULL },
    { kind: MenuItemKind.SEPARATOR, id: "divider" },
    {
      kind: MenuItemKind.SUBMENU,
      id: "recent",
      label: "Recent captures",
      emptyLabel: "Nothing yet",
      level: MenuLevel.STANDARD,
      items: () => recentCaptures().map((name, iCapture) => ({ kind: MenuItemKind.COMMAND, id: \`recent.\${iCapture}\`, label: name }))
    },
    { kind: MenuItemKind.CHECK, id: "autostart", isChecked: () => isAutostart, label: "Start with Windows", onselect: toggleAutostart, level: MenuLevel.STANDARD },
    ...isAutostart ? [{ kind: MenuItemKind.COMMAND, id: "sign-in-delay", label: "Delay at sign-in", level: MenuLevel.FULL }] : []
  ]
});
`;

async function bytesOf({ file, root }: {
  file: string;
  root: string;
}) {
  const outDirectory = mkdtempSync(path.join(tmpdir(), "tray-svelte-out-"));
  await buildTray({
    root,
    file,
    outDirectory,
    isFirst: true,
    isMinified: true,
    config: {
      resolve: {
        alias: exportAliases(ExportTarget.BUILT)
      }
    }
  });
  const code = readFileSync(path.join(outDirectory, "tray.js"), "utf8");
  const manifest = JSON.parse(readFileSync(path.join(outDirectory, "tray.json"), "utf8"));
  rmSync(outDirectory, {
    recursive: true,
    force: true
  });
  return {
    code,
    manifest,
    bytes: Buffer.byteLength(code)
  };
}

test("a tray.svelte builds to a tray.js with no Svelte runtime, about the size of the hand-written tray.ts", {
  skip: !IS_BUILT,
  timeout: BUILD_TIMEOUT_MILLISECONDS
}, async () => {
  const handRoot = mkdtempSync(path.join(tmpdir(), "tray-svelte-hand-"));
  mkdirSync(path.join(handRoot, "entrypoints"));
  const handFile = path.join(handRoot, "entrypoints", "tray.ts");
  writeFileSync(handFile, HAND_WRITTEN);
  copyFileSync(ICON_FILE, path.join(handRoot, "entrypoints", "tray.ico"));
  const markup = await bytesOf({
    file: MARKUP_FILE,
    root: EXAMPLE_ROOT
  });
  const hand = await bytesOf({
    file: handFile,
    root: handRoot
  });
  rmSync(handRoot, {
    recursive: true,
    force: true
  });
  console.log(`tray.js from tray.svelte: ${markup.bytes} bytes, from tray.ts: ${hand.bytes} bytes`);
  assert.deepEqual(markup.manifest, {
    icon: "tray.ico",
    tooltip: "Tray entrypoint (Svelte) example",
    guid: "3b0e8f4a-6c52-4d1e-9a77-5c1d2e8b4f90"
  });
  assert.ok(markup.bytes <= BUDGET_BYTES, `${markup.bytes} bytes is over the ${BUDGET_BYTES} budget`);
  assert.ok(markup.bytes <= hand.bytes + SLACK_BYTES, `${markup.bytes} bytes is more than ${SLACK_BYTES} over the hand-written ${hand.bytes}`);
  assert.deepEqual(FORBIDDEN_PATTERNS.filter(pattern => pattern.test(markup.code)), [], "Svelte or a component is in tray.js");
});
