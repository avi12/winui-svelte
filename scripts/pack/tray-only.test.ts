import {
  assertWithinBudget,
  BUNDLE_TIMEOUT_MILLISECONDS,
  bundleEntry,
  IS_BUILT,
  ownFilesOf,
  TrayBudget
} from "./bundle-support.ts";
import assert from "node:assert/strict";
import path from "node:path";
import { test } from "node:test";

// What a tray-only process ships: the notification-area icon, its popup menu
// and the call that starts or signals the app, and nothing of the component
// barrel or the window runtime. Bundled the way a consumer's build would,
// against the built package; dynwinrt stays external, as a native module.

const APP_FOLDER = path.join(import.meta.dirname, "treeshake-app");
const ENTRY = path.join(APP_FOLDER, "tray-main.ts");
const TWO_TRAYS_ENTRY = path.join(APP_FOLDER, "tray-two-main.ts");
const WINDOW_RUNTIME_FOLDERS = ["components", "renderer", "window", "css"];
const COMPONENT_NAMES = ["NavigationView", "ComboBox", "TextBlock", "ScrollViewer", "MenuFlyout", "ContentDialog"];

test("a tray-only process bundles no component and no window runtime", {
  skip: !IS_BUILT,
  timeout: BUNDLE_TIMEOUT_MILLISECONDS
}, async () => {
  const { code, sourceFiles } = await bundleEntry(ENTRY);
  const bytes = Buffer.byteLength(code);
  console.log(`tray-only: ${bytes} bytes, ${sourceFiles.length} modules`);
  assertWithinBudget({
    bytes,
    budget: TrayBudget.trayOnly
  });

  const ownFiles = ownFilesOf(sourceFiles);
  const heavy = ownFiles.filter(file => WINDOW_RUNTIME_FOLDERS.includes(file.split("/")[0] ?? ""));
  assert.deepEqual(heavy, [], "the window runtime or the components were bundled");

  const found = COMPONENT_NAMES.filter(name => code.includes(name));
  assert.deepEqual(found, [], "a component's name is in the bundle");
});

// Two icons in one process, each with its own color scheme, one of them
// reading the progress registry in its menu: still no component, no window
// runtime and no taskbar code.
const TASKBAR_NAMES = ["TaskbarProgress", "taskbar-calls", "ITaskbarList"];

test("a tray-only process with two trays and the progress registry bundles no window runtime and no taskbar code", {
  skip: !IS_BUILT,
  timeout: BUNDLE_TIMEOUT_MILLISECONDS
}, async () => {
  const { code, sourceFiles } = await bundleEntry(TWO_TRAYS_ENTRY);
  const bytes = Buffer.byteLength(code);
  console.log(`two trays: ${bytes} bytes, ${sourceFiles.length} modules`);
  assertWithinBudget({
    bytes,
    budget: TrayBudget.twoTrays
  });

  const ownFiles = ownFilesOf(sourceFiles);
  const heavy = ownFiles.filter(file => WINDOW_RUNTIME_FOLDERS.includes(file.split("/")[0] ?? ""));
  assert.deepEqual(heavy, [], "the window runtime or the components were bundled");
  assert.deepEqual(COMPONENT_NAMES.filter(name => code.includes(name)), [], "a component's name is in the bundle");
  assert.deepEqual(TASKBAR_NAMES.filter(name => code.includes(name)), [], "taskbar code is in the bundle");
  assert.deepEqual(ownFiles.filter(file => file.includes("taskbar")), [], "a taskbar module was bundled");
  assert.deepEqual(sourceFiles.filter(file => /[/]svelte[/]/u.test(file)), [], "a Svelte module was bundled");
});
