import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { test } from "node:test";

// Trays and windows are independent: the sources reachable from the standalone
// tray (and from the headless progress entry) import nothing of the component
// barrel, the renderer or the window runtime; and nothing of the tray reaches
// the taskbar progress code. Read from the static imports of the sources, so
// it needs no build.

const SOURCE_ROOT = path.join(import.meta.dirname, "..", "..", "src");
const IMPORT_PATTERN = /^\s*(?:import|export)\s[^"']*?from\s+["']([^"']+)["']|^\s*import\s+["']([^"']+)["']/gmu;
const ALIAS_PREFIX = "#src/";
const WINDOW_SIDE_FOLDERS = ["components", "renderer", "window", "css"];
const SOURCE_EXTENSION = /\.js$/u;

function resolveImport({ from, specifier }: {
  from: string;
  specifier: string;
}) {
  const isAlias = specifier.startsWith(ALIAS_PREFIX);
  const isRelative = specifier.startsWith(".");
  const isLocal = isAlias || isRelative;
  if (!isLocal) {
    return undefined;
  }

  const base = isAlias ?
    path.join(SOURCE_ROOT, specifier.slice(ALIAS_PREFIX.length)) :
    path.resolve(path.dirname(from), specifier);
  const candidate = base.replace(SOURCE_EXTENSION, ".ts");
  return existsSync(candidate) ? candidate : undefined;
}

function reachableFrom(entry: string) {
  const seen = new Set<string>();
  const pending = [path.join(SOURCE_ROOT, entry)];
  for (const file of pending) {
    if (seen.has(file)) {
      continue;
    }

    seen.add(file);
    const text = readFileSync(file, "utf8");
    for (const match of text.matchAll(IMPORT_PATTERN)) {
      const specifier = match[1] ?? match[2] ?? "";
      const resolved = resolveImport({
        from: file,
        specifier
      });
      const isFound = resolved !== undefined;
      if (isFound) {
        pending.push(resolved);
      }
    }
  }

  return [...seen].map(file => path.relative(SOURCE_ROOT, file).split(path.sep).join("/"));
}

test("the standalone tray reaches no component, renderer, window or taskbar source", () => {
  const files = reachableFrom("tray/standalone/index.ts");
  const windowSide = files.filter(file => WINDOW_SIDE_FOLDERS.includes(file.split("/")[0] ?? ""));
  assert.deepEqual(windowSide, [], "the standalone tray imports the window runtime");
  assert.deepEqual(files.filter(file => /taskbar/u.test(file)), [], "the standalone tray imports taskbar code");
  assert.ok(files.length > 10, "the walk found the tray's sources");
});

test("the standalone tray's own folder and the tray core import no Svelte file", () => {
  const files = reachableFrom("tray/standalone/index.ts");
  assert.deepEqual(files.filter(file => file.endsWith(".svelte")), []);
});

test("the headless progress entry reaches no window, component or taskbar source", () => {
  const files = reachableFrom("progress/core.ts");
  const windowSide = files.filter(file => WINDOW_SIDE_FOLDERS.includes(file.split("/")[0] ?? ""));
  assert.deepEqual(windowSide, []);
  assert.deepEqual(files.filter(file => /taskbar|tray/u.test(file)), []);
  assert.ok(files.includes("progress/progress-registry.ts"));
});

test("the taskbar progress binding reaches no tray source", () => {
  const files = reachableFrom("progress/taskbar-progress.ts");
  assert.deepEqual(files.filter(file => file.startsWith("tray/")), []);
  assert.ok(files.includes("window/taskbar-calls.ts"));
});

test("a window is created without importing any tray source", () => {
  const files = reachableFrom("window/create-window.ts");
  assert.deepEqual(files.filter(file => file.startsWith("tray/") || /progress/u.test(file)), []);
  assert.ok(files.length > 10, "the walk found the window's sources");
});
