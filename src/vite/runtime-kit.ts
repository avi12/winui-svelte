import {
  BOOTSTRAPPER_NAME,
  bootstrapperFolderIn,
  bootstrapperFolders,
  catalogueFile,
  catalogueFileIn
} from "#src/runtime-files.js";
import { copyFileSync, existsSync, mkdirSync, readdirSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";

// The files a built app reads at run time, written next to its bundle so the
// app needs no `node_modules` and no copy of this package: the native module
// with the libraries it loads, the Windows App SDK bootstrapper with the
// native libraries beside it, and the catalogue of WinUI's resources. The
// readers (src/runtime-files.ts, and Node's own resolution for the native
// module) look in these places.

const NATIVE_MODULE = "@microsoft/dynwinrt";
const NATIVE_MODULE_FOLDER = "dist";
const C_RUNTIME = "vcruntime140.dll";
const SOURCE_EXTENSIONS = [".js", ".cjs"];
const NATIVE_EXTENSION = ".node";
const NATIVE_TARGETS = {
  x64: "win32-x64-msvc",
  arm64: "win32-arm64-msvc"
} as const;

function isSupportedArchitecture(architecture: string): architecture is keyof typeof NATIVE_TARGETS {
  return architecture in NATIVE_TARGETS;
}

function copyInto({ source, folder }: {
  source: string;
  folder: string;
}) {
  mkdirSync(folder, { recursive: true });
  copyFileSync(source, path.join(folder, path.basename(source)));
}

function copyNativeModule(outDirectory: string) {
  const { arch } = process;
  if (!isSupportedArchitecture(arch)) {
    throw new Error(`winui-svelte builds for Windows x64 or arm64, not ${arch}`);
  }

  const manifest = createRequire(import.meta.url).resolve(`${NATIVE_MODULE}/package.json`);
  const source = path.join(path.dirname(manifest), NATIVE_MODULE_FOLDER);
  const target = path.join(outDirectory, "node_modules", NATIVE_MODULE);
  copyInto({
    source: manifest,
    folder: target
  });
  const ownNative = `dynwinrt.${NATIVE_TARGETS[arch]}${NATIVE_EXTENSION}`;
  function isShipped(file: string) {
    return file === ownNative || SOURCE_EXTENSIONS.includes(path.extname(file));
  }

  const files = readdirSync(source).filter(isShipped);
  if (!files.includes(ownNative)) {
    throw new Error(`${ownNative} not found in ${source}`);
  }

  for (const file of files) {
    copyInto({
      source: path.join(source, file),
      folder: path.join(target, NATIVE_MODULE_FOLDER)
    });
  }

  // The native module loads the C runtime by name, from its own folder.
  const systemRoot = process.env["SystemRoot"] ?? "C:Windows";
  const runtime = path.join(systemRoot, "System32", C_RUNTIME);
  if (!existsSync(runtime)) {
    throw new Error(`${C_RUNTIME} not found at ${runtime}`);
  }

  copyInto({
    source: runtime,
    folder: path.join(target, NATIVE_MODULE_FOLDER)
  });
}

function copyBootstrapper(outDirectory: string) {
  const folders = bootstrapperFolders();
  const source = folders.find(folder => existsSync(path.join(folder, BOOTSTRAPPER_NAME)));
  const isMissing = source === undefined;
  if (isMissing) {
    throw new Error(`${BOOTSTRAPPER_NAME} not found in ${folders.join(", ")}`);
  }

  for (const file of readdirSync(source)) {
    copyInto({
      source: path.join(source, file),
      folder: bootstrapperFolderIn(outDirectory)
    });
  }
}

/**
 * Writes the files a built app reads at run time into `outDirectory`, for the
 * architecture this process runs: `node_modules/@microsoft/dynwinrt` (its
 * JavaScript and its `.node` file, with the C runtime beside it), `bin/<arch>`
 * (the bootstrapper and the libraries WebView2 and Win2D load by name) and the
 * resource catalogue.
 *
 * @param outDirectory - The folder the bundle was written to.
 * @throws {Error} naming the file when one of them cannot be found.
 */
export function writeRuntimeKit(outDirectory: string) {
  copyNativeModule(outDirectory);
  copyBootstrapper(outDirectory);
  const catalogue = catalogueFile();
  const target = catalogueFileIn(outDirectory);
  copyInto({
    source: catalogue,
    folder: path.dirname(target)
  });
}
