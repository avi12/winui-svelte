import { readFile, stat } from "node:fs/promises";
import path from "node:path";
import { z } from "zod";

const PACKAGE_NAME = "winui-svelte";
const DEPENDENCY_KEYS = ["dependencies", "devDependencies", "peerDependencies", "optionalDependencies"] as const;
const manifestSchema = z.object(Object.fromEntries(DEPENDENCY_KEYS.map(key => [key, z.record(z.string(), z.unknown()).optional()])));
const gates = new Map<string, boolean>();

function parseManifest(text: string) {
  try {
    return manifestSchema.safeParse(JSON.parse(text));
  } catch {
    return undefined;
  }
}

/**
 * Whether the text of a package.json lists winui-svelte as a dependency, a dev, peer or optional one; text that is not
 * a package.json lists nothing.
 */
export function dependsOnLibrary(text: string) {
  const parsed = parseManifest(text);
  const hasNoManifest = parsed === undefined || !parsed.success;
  if (hasNoManifest) {
    return false;
  }

  return DEPENDENCY_KEYS.some(key => PACKAGE_NAME in (parsed.data[key] ?? {}));
}

async function exists(file: string) {
  return stat(file).then(() => true, () => false);
}

async function nearestManifest(start: string) {
  for (let folder = start; ; folder = path.dirname(folder)) {
    const candidate = path.join(folder, "package.json");
    if (await exists(candidate)) {
      return candidate;
    }

    const isRoot = path.dirname(folder) === folder;
    if (isRoot) {
      return undefined;
    }
  }
}

/**
 * Whether the nearest package.json above a file lists winui-svelte as a dependency or a dev dependency.
 */
export async function isWinuiFile(file: string) {
  const manifestPath = await nearestManifest(path.dirname(file));
  const hasNoManifest = manifestPath === undefined;
  if (hasNoManifest) {
    return false;
  }

  const { mtimeMs } = await stat(manifestPath);
  const key = `${manifestPath}@${mtimeMs}`;
  const isKnown = gates.has(key);
  if (isKnown) {
    return gates.get(key) === true;
  }

  const isDependent = dependsOnLibrary(await readFile(manifestPath, "utf8"));
  gates.set(key, isDependent);
  return isDependent;
}

/**
 * The folder of the nearest package.json above a file, which a picture path may be relative to.
 */
export async function projectRootOf(file: string) {
  const manifestPath = await nearestManifest(path.dirname(file));
  return manifestPath === undefined ? path.dirname(file) : path.dirname(manifestPath);
}
