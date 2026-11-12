import { compareVersions } from "./version.ts";
import { readdir } from "node:fs/promises";
import path from "node:path";

const APP_FOLDER = /^app-(\d+\.\d+\.\d+)$/;
const PACKAGES_FOLDER = "packages";

/**
 * The folder one version lives in, under the install root.
 *
 * @param options - The install root and the version.
 * @returns The folder's path (`<root>/app-<version>`).
 */
export function appFolder({ root, version }: {
  root: string;
  version: string;
}) {
  return path.join(root, `app-${version}`);
}

/**
 * Where downloaded zips are kept.
 *
 * @param root - The install root.
 * @returns The folder's path.
 */
export function packagesFolder(root: string) {
  return path.join(root, PACKAGES_FOLDER);
}

/**
 * Lists the versions installed under a root, newest first.
 *
 * @param root - The install root.
 * @returns The versions; empty when the root does not exist.
 */
export async function installedVersions(root: string) {
  const entries = await readdir(root, {
    withFileTypes: true
  }).catch(() => []);
  const versions = entries.flatMap(entry => {
    const version = APP_FOLDER.exec(entry.name)?.[1];
    const isVersionFolder = entry.isDirectory() && version !== undefined;
    return isVersionFolder ? [version] : [];
  });
  return versions.toSorted((left, right) => compareVersions({
    left: right,
    right: left
  }));
}
