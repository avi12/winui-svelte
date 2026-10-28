import { readFileSync } from "node:fs";
import path from "node:path";
import { z } from "zod";

// Vite aliases that point the package's own specifiers (winui-svelte/host,
// winui-svelte/css, ...) at files of this repository, since inside it the
// package is not installed anywhere. package.json's exports are the one list
// of entry points: they name the built files (dist), which a consumer gets;
// the sources are the same paths under src.

const PACKAGE_ROOT = path.join(import.meta.dirname, "..");
const PACKAGE_NAME = "winui-svelte";
const BUILT_FOLDER = "./dist/";
const SOURCE_FOLDER = "./src/";
const builtExtension = /\.js$/u;

const manifestSchema = z.object({
  exports: z.record(z.string(), z.union([z.string(), z.object({ default: z.string() })]))
});

export const ExportTarget = {
  BUILT: "dist",
  SOURCE: "src"
} as const;

export type ExportTarget = typeof ExportTarget[keyof typeof ExportTarget];

// ./dist/renderer/host/host.js is built from ./src/renderer/host/host.ts.
function targetFile({ builtFile, target }: {
  builtFile: string;
  target: ExportTarget;
}) {
  const file = target === ExportTarget.BUILT ?
    builtFile :
    builtFile.replace(BUILT_FOLDER, SOURCE_FOLDER).replace(builtExtension, ".ts");
  return path.join(PACKAGE_ROOT, file);
}

export function exportAliases(target: ExportTarget) {
  const manifest = manifestSchema.parse(JSON.parse(readFileSync(path.join(PACKAGE_ROOT, "package.json"), "utf8")));
  return Object.entries(manifest.exports).flatMap(([subpath, entry]) => {
    const builtFile = typeof entry === "string" ? entry : entry.default;
    const isBuilt = builtFile.startsWith(BUILT_FOLDER);
    return isBuilt ? [{
      find: new RegExp(`^${PACKAGE_NAME}${subpath.slice(1)}$`, "u"),
      replacement: targetFile({
        builtFile,
        target
      })
    }] : [];
  });
}
