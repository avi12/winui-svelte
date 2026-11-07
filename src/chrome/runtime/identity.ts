import { getPackageInfo } from "#src/store/identity.js";
import type { PackageInfo } from "#src/store/types.js";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { z } from "zod";

const packageJsonSchema = z.object({
  name: z.string().min(1),
  version: z.string().min(1),
  description: z.string().optional()
});

/** What the app is, from its package identity or its `package.json`. */
export interface AppIdentity {
  /** The package family name when packaged, else the `package.json` name. */
  readonly id: string;
  readonly name: string;
  readonly version: string;
  readonly description?: string | undefined;

  /** Where the app is installed (packaged) or where its `package.json` is. */
  readonly root: string;
  readonly isPackaged: boolean;
}

/** Where the identity comes from; a test gives both. */
export interface IdentitySources {
  /** The running package, or null with no package identity. */
  readonly packageInfo?: () => PackageInfo | null;

  /** The text of the nearest `package.json` above the entry script, if any. */
  readonly packageJson?: () => {
    readonly file: string;
    readonly text: string;
  } | undefined;
}

function findPackageJson() {
  const entry = process.argv[1] ?? process.cwd();
  let folder = path.dirname(path.resolve(entry));
  for (;;) {
    const file = path.join(folder, "package.json");
    const isFound = existsSync(file);
    if (isFound) {
      return {
        file,
        text: readFileSync(file, "utf8")
      };
    }

    const parent = path.dirname(folder);
    const isRoot = parent === folder;
    if (isRoot) {
      return undefined;
    }

    folder = parent;
  }
}

/**
 * Reads what the app is: the running package when it has an identity (its
 * family name is the id), otherwise the nearest `package.json` above the
 * entry script (its name is the id).
 *
 * @param sources - Optional; the real sources by default.
 * @returns The identity.
 * @throws {Error} When there is neither a package nor a valid `package.json`.
 */
export function resolveIdentity({ packageInfo = getPackageInfo, packageJson = findPackageJson }: IdentitySources = {}) {
  const info = packageInfo();
  const isPackaged = info !== null;
  if (isPackaged) {
    return {
      id: info.familyName,
      name: info.name,
      version: info.version,
      root: info.installedPath,
      isPackaged: true
    } satisfies AppIdentity;
  }

  const found = packageJson();
  const isMissing = found === undefined;
  if (isMissing) {
    throw new Error("the app has no package identity and no package.json was found above its entry script");
  }

  const parsed = packageJsonSchema.parse(JSON.parse(found.text));
  return {
    id: parsed.name,
    name: parsed.name,
    version: parsed.version,
    description: parsed.description,
    root: path.dirname(found.file),
    isPackaged: false
  } satisfies AppIdentity;
}

/**
 * The address of a file in the app: `ms-appx:///path` inside a package, a
 * `file:` URL under the folder of `package.json` otherwise.
 *
 * @param options - The identity and the path inside the app.
 * @returns The address.
 */
export function appUrl({ identity, relativePath }: {
  identity: AppIdentity;
  relativePath: string;
}) {
  const trimmed = relativePath.replace(/^[\\/]+/u, "");
  const base = identity.isPackaged ? "ms-appx:///" : pathToFileURL(`${identity.root}${path.sep}`).href;
  return new URL(trimmed, base).href;
}
