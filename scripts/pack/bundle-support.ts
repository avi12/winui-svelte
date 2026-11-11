import { exportAliases, ExportTarget } from "#scripts/export-aliases.ts";
import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import path from "node:path";
import { build } from "vite";

// What the bundle-budget tests share: the package, the way a consumer's build
// bundles against it, and the tray budgets. Every budget is the measured size
// of its bundle: lower it when the bundle gets smaller, never raise it to make
// a change pass. Each test still prints the number it measured.

export const PACKAGE_ROOT = path.join(import.meta.dirname, "..", "..");
export const IS_BUILT = existsSync(path.join(PACKAGE_ROOT, "dist"));
export const BUNDLE_TIMEOUT_MILLISECONDS = 120_000;

/** Bytes of the bundles the tray tests measure. */
export const TrayBudget = {
  /** Only the menu model (`winui-svelte/tray/menu`); a server-side build leaves zod and Svelte as imports. */
  menuModel: 5000,
  /** A tray-only process: icon, popup menu and the call that starts or signals the app. */
  trayOnly: 20_700,
  /** Two icons, each with its own color scheme, one reading the progress registry. */
  twoTrays: 22_900,
  /** `tray.js` of the tray entrypoint example; about 85 000 of it is zod, which an app build bundles. */
  entrypoint: 102_500,
  /** `tray.js` of the tray written as markup. */
  svelteEntrypoint: 103_100
} as const;

const externalModule = new RegExp(String.raw`^#winui/|dist[\/]bindings|@microsoft[\/]dynwinrt`, "u");

/**
 * Bundles an entry against the built package, minified, server side (dynwinrt
 * and the generated bindings stay external, as native modules).
 *
 * @param entry - The entry file.
 * @returns The code and the source files of every chunk.
 */
export async function bundleEntry(entry: string) {
  const result = await build({
    configFile: false,
    root: path.dirname(entry),
    logLevel: "warn",
    resolve: {
      alias: exportAliases(ExportTarget.BUILT)
    },
    build: {
      write: false,
      ssr: true,
      minify: true,
      rollupOptions: {
        input: entry,
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

/**
 * The files of the package among a bundle's source files.
 *
 * @param sourceFiles - The files Rollup reports.
 * @returns Their paths inside `dist`, with slashes.
 */
export function ownFilesOf(sourceFiles: readonly string[]) {
  const distFolder = path.join(PACKAGE_ROOT, "dist") + path.sep;
  return sourceFiles
    .map(file => path.normalize(file))
    .filter(file => file.startsWith(distFolder))
    .map(file => file.slice(distFolder.length).replaceAll(path.sep, "/"));
}

/**
 * Fails when a bundle is over its budget.
 *
 * @param options - The size and the budget.
 */
export function assertWithinBudget({ bytes, budget }: {
  readonly bytes: number;
  readonly budget: number;
}) {
  assert.ok(bytes <= budget, `${bytes} bytes is over the ${budget} budget`);
}
