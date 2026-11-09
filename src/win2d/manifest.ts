import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

// What a packaged app's manifest must say for Win2D to activate: a package's
// registration catalogue holds only the classes its manifest declares (and
// those of its framework packages), and Win2D ships no framework package, so
// every Win2D class the app uses is an `ActivatableClass` of an
// `InProcessServer` that names Microsoft.Graphics.Canvas.dll inside the
// package. Unpackaged, `initWindowsAppSdk` puts the library's folder on PATH
// and the class is found without any of this.

const WIN2D_NAMESPACE = "Microsoft.Graphics.Canvas";
const ANCHOR_CLASS = "microsoft/graphics/canvas/CanvasDevice";
const ACTIVATION_PATTERN = /activationFactory\('(Microsoft\.Graphics\.Canvas\.[^']+)'/g;
const THREADING_MODEL = "both";

/** The category of the manifest extension that registers a class living in a DLL of the package. */
export const IN_PROCESS_SERVER_CATEGORY = "windows.activatableClass.inProcessServer";

function bindingsFolder() {
  const anchor = fileURLToPath(import.meta.resolve(`#winui/${ANCHOR_CLASS}`));
  return path.resolve(path.dirname(anchor), "..", "..", "..");
}

function bindingFiles(folder: string) {
  return readdirSync(folder, {
    withFileTypes: true,
    recursive: true
  }).filter(entry => entry.isFile() && entry.name.endsWith(".js")).map(entry => path.join(entry.parentPath, entry.name));
}

/**
 * Every Win2D class the bindings activate by name, sorted.
 *
 * @param options - `bindings`: the folder the `#winui` bindings are generated
 *     into; the library's own by default.
 * @returns Full class names such as `Microsoft.Graphics.Canvas.Effects.GaussianBlurEffect`.
 */
export function win2dClassNames({ bindings = bindingsFolder() }: { bindings?: string } = {}) {
  const names = new Set<string>();
  for (const file of bindingFiles(path.join(bindings, ...WIN2D_NAMESPACE.toLowerCase().split(".")))) {
    for (const match of readFileSync(file, "utf8").matchAll(ACTIVATION_PATTERN)) {
      names.add(match[1] ?? "");
    }
  }

  return [...names].sort();
}

/**
 * The manifest fragment that lets a packaged app activate Win2D: one
 * `InProcessServer` with an `ActivatableClass` per class. Put it in the
 * package's own `<Extensions>` (a child of `<Package>`, after
 * `<Capabilities>`), not the application's, and ship
 * `Microsoft.Graphics.Canvas.dll` at `libraryPath` (`bin\x64\...`, which
 * `buildApp` writes); an x64 and an arm64 package each need their own path.
 *
 * @param options - `libraryPath`: where the DLL is inside the package,
 *     relative to its root. `classes`: the classes to list, every Win2D class
 *     the bindings hold by default. `bindings`: where those bindings are.
 * @returns The `<Extension>` element.
 */
export function win2dActivatableClasses({ libraryPath, classes, bindings }: {
  libraryPath: string;
  classes?: readonly string[];
  bindings?: string;
}) {
  const listed = classes ?? win2dClassNames(bindings === undefined ? {} : { bindings });
  const entries = listed.map(name => `    <ActivatableClass ActivatableClassId="${name}" ThreadingModel="${THREADING_MODEL}" />`);
  return [
    `<Extension Category="${IN_PROCESS_SERVER_CATEGORY}">`,
    "  <InProcessServer>",
    `    <Path>${libraryPath.replaceAll("/", "\\")}</Path>`,
    ...entries,
    "  </InProcessServer>",
    "</Extension>"
  ].join("\n");
}
