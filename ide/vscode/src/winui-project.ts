import { readFile, stat } from "node:fs/promises";
import path from "node:path";
import { z } from "zod";

const PACKAGE_NAME = "winui-svelte";
const manifestSchema = z.object({
  dependencies: z.record(z.string(), z.unknown()).optional(),
  devDependencies: z.record(z.string(), z.unknown()).optional()
});
const gates = new Map<string, boolean>();

async function exists(file: string) {
  return stat(file).then(() => true, () => false);
}

async function nearestManifest(folder: string): Promise<string | undefined> {
  const candidate = path.join(folder, "package.json");
  if (await exists(candidate)) {
    return candidate;
  }

  const parent = path.dirname(folder);
  const isRoot = parent === folder;
  return isRoot ? undefined : nearestManifest(parent);
}

/**
 * Whether the nearest package.json above a file lists winui-svelte as a dependency or a dev dependency.
 */
export async function isWinuiFile(file: string) {
  const manifestPath = await nearestManifest(path.dirname(file));
  if (manifestPath === undefined) {
    return false;
  }

  const { mtimeMs } = await stat(manifestPath);
  const key = `${manifestPath}@${mtimeMs}`;
  const known = gates.get(key);
  if (known !== undefined) {
    return known;
  }

  const parsed = manifestSchema.safeParse(JSON.parse(await readFile(manifestPath, "utf8")));
  const isDependent = parsed.success
    && (PACKAGE_NAME in (parsed.data.dependencies ?? {}) || PACKAGE_NAME in (parsed.data.devDependencies ?? {}));
  gates.set(key, isDependent);
  return isDependent;
}
