import { existsSync } from "node:fs";
import path from "node:path";

// Where the package's data files are, from the one place that knows the three
// layouts this module runs in: the sources (src/), the published package
// (dist/) and a bundle `buildApp` wrote, whose own folder takes the place of
// dist/ (the build emits every file below there). The module sits at the top
// of each tree, so the same relative paths hold in all three.

const CATALOGUE_FOLDER = "css";
const CATALOGUE_NAME = "winui-resources.g.json";
const BOOTSTRAPPER_FOLDER = "bin";

/** The bootstrapper's file name. */
export const BOOTSTRAPPER_NAME = "Microsoft.WindowsAppRuntime.Bootstrap.dll";

const RESTORED_FOLDERS = [".winapp", "bin"];

/**
 * Where the catalogue of WinUI's resources is, or would be, in a layout whose
 * top folder is `folder`.
 *
 * @param folder - The package's `dist`, or a built app's output folder.
 * @returns The catalogue's path.
 */
export function catalogueFileIn(folder: string) {
  return path.join(folder, CATALOGUE_FOLDER, CATALOGUE_NAME);
}

/**
 * Where the Windows App SDK bootstrapper and the native libraries beside it
 * are, or would be, in a layout whose top folder is `folder`, for the
 * architecture this process runs.
 *
 * @param folder - The package's `dist`, or a built app's output folder.
 * @returns The folder.
 */
export function bootstrapperFolderIn(folder: string) {
  return path.join(folder, BOOTSTRAPPER_FOLDER, process.arch);
}

/**
 * The catalogue of WinUI's resources, in whichever layout this runs.
 *
 * @returns The catalogue's path.
 * @throws {Error} naming the file when it is not there.
 */
export function catalogueFile() {
  const file = catalogueFileIn(import.meta.dirname);
  if (!existsSync(file)) {
    throw new Error(`${CATALOGUE_NAME} not found at ${file}: buildApp writes it into the output folder`);
  }

  return file;
}

/**
 * The folders that may hold the bootstrapper, in the order to try: beside the
 * bundle or in the published package, then this repository's own restore.
 *
 * @returns The folders, whether or not they exist.
 */
export function bootstrapperFolders() {
  return [
    bootstrapperFolderIn(import.meta.dirname),
    path.join(import.meta.dirname, "..", ...RESTORED_FOLDERS, process.arch)
  ];
}
