import { readFileSync } from "node:fs";
import path from "node:path";
import { z } from "zod";

// Vite aliases that point the package's own specifiers (winui-svelte/host,
// winui-svelte/css, ...) at files of this repository, since inside it the
// package is not installed anywhere. package.json's exports are the one list
// of entry points: they name the built files (dist), which a consumer gets;
// the sources are the same paths under src.

const packageRoot = path.join(import.meta.dirname, "..");
const packageName = "winui-svelte";
const builtFolder = "./dist/";
const sourceFolder = "./src/";
const builtExtension = /\.js$/u;

const manifestSchema = z.object({
  exports: z.record(z.string(), z.union([z.string(), z.object({ default: z.string() })]))
});

export const ExportTarget = {
  Built: "dist",
  Source: "src"
} as const;

export type ExportTarget = typeof ExportTarget[keyof typeof ExportTarget];

export interface Alias {
  find: RegExp;
  replacement: string;
}

// ./dist/renderer/host/host.js is built from ./src/renderer/host/host.ts.
function targetFile(builtFile: string, target: ExportTarget): string {
  const file = target === ExportTarget.Built ?
    builtFile :
    builtFile.replace(builtFolder, sourceFolder).replace(builtExtension, ".ts");
  return path.join(packageRoot, file);
}

export function exportAliases(target: ExportTarget): Alias[] {
  const manifest = manifestSchema.parse(JSON.parse(readFileSync(path.join(packageRoot, "package.json"), "utf8")));
  return Object.entries(manifest.exports).flatMap(([subpath, entry]) => {
    const builtFile = typeof entry === "string" ? entry : entry.default;
    const isBuilt = builtFile.startsWith(builtFolder);
    return isBuilt ? [{
      find: new RegExp(`^${packageName}${subpath.slice(1)}$`, "u"),
      replacement: targetFile(builtFile, target)
    }] : [];
  });
}
