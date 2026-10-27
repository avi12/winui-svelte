import type { BindingEntry } from "./binding-list.ts";
import { bindingEntriesOf, packageJsonWithBindings } from "./binding-list.ts";
import { readList, readRecord } from "./json-shape.ts";
import { customSvelteSource } from "#src/vite/custom-svelte.js";
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

// `winui-svelte setup`: what an app needs on disk to use the package's
// controls, which are drawn from bindings the app generates for itself (the
// package imports them as #winui/*, mapped to the app's @winapp/bindings).
//
//   1. winapp.yaml, which names the Windows App SDK and the tools `winapp`
//      needs (kept if the app has one);
//   2. package.json: the classes the package uses in winapp.jsBindings, the
//      @winapp/bindings dependency that links the generated folder, and the
//      Svelte build with the custom-renderer option (unless the app already
//      names a Svelte);
//   3. `winapp restore` and `winapp node generate-bindings`, which fetch the
//      SDK, write .winapp (metadata, the bootstrapper) and generate the
//      bindings in .winapp/bindings.
//
// What it cannot do is link the generated folder into node_modules: the app's
// package manager does that, so it is run once more afterwards.

const BINDINGS_DEPENDENCY = "@winapp/bindings";
const BINDINGS_LINK = "link:.winapp/bindings";
const WINAPP_FILE = "winapp.yaml";
const requiredBindingsUrl = new URL("../components/generated/required-bindings.json", import.meta.url);

/** The `winapp.yaml` an app gets: the Windows App SDK this package is built and tested against. */
export const WINAPP_YAML = `# winapp restore reads this: the Windows App SDK the window is drawn with, and
# what restore itself needs (CppWinRT and the Windows SDK's metadata) to
# generate the bindings in .winapp/bindings from package.json's
# winapp.jsBindings.
packages:
  - name: Microsoft.Windows.CppWinRT
    version: 3.0.260520.1
  - name: Microsoft.WindowsAppSDK
    version: 2.2.0
  - name: Microsoft.Windows.ImplementationLibrary
    version: 1.0.260126.7
  - name: Microsoft.Windows.SDK.CPP
    version: 10.0.28000.2270
  - name: Microsoft.Windows.SDK.CPP.x64
    version: 10.0.28000.2270
`;

/** What `setup` is asked to prepare. */
export interface SetupOptions {
  /** The app's folder (the one with its package.json). */
  directory: string;

  /** The `winapp` command, when it is not in the app's node_modules/.bin or on PATH. */
  winapp?: string;

  /** Write the files only; do not run winapp. */
  isDryRun?: boolean;
}

/**
 * The classes this package needs bindings for, as the generator wrote them to
 * `required-bindings.json`.
 *
 * @throws when that file is not a list
 */
export function requiredBindings() {
  const list = readList(JSON.parse(readFileSync(requiredBindingsUrl, "utf8")));
  const isList = list !== undefined;
  if (!isList) {
    throw new TypeError("required-bindings.json is not a list");
  }

  return bindingEntriesOf(list);
}

/**
 * package.json's text ready for the package's controls: the class list started
 * if the app has none, filled with what the package needs, and the
 * `@winapp/bindings` dependency present. The custom Svelte build is added
 * unless the app already names a Svelte.
 *
 * @throws when `original` is not a JSON object
 */
export function packageJsonForApp({ original, required }: {
  original: string;
  required: BindingEntry[];
}) {
  const parsed = readRecord(JSON.parse(original));
  const isObject = parsed !== undefined;
  if (!isObject) {
    throw new TypeError("package.json is not an object");
  }

  const winapp = readRecord(parsed["winapp"]) ?? {};
  const jsBindings = readRecord(winapp["jsBindings"]) ?? {};
  const additionalWinmds = readList(jsBindings["additionalWinmds"]) ?? [];
  const dependencies = readRecord(parsed["dependencies"]) ?? {};
  dependencies[BINDINGS_DEPENDENCY] ??= BINDINGS_LINK;
  const devDependencies = readRecord(parsed["devDependencies"]) ?? {};
  const hasSvelte = "svelte" in dependencies || "svelte" in devDependencies;
  if (!hasSvelte) {
    dependencies["svelte"] = customSvelteSource;
  }

  const newline = original.includes("\r\n") ? "\r\n" : "\n";
  const started = {
    ...parsed,
    dependencies,
    winapp: {
      ...winapp,
      jsBindings: {
        ...jsBindings,
        additionalWinmds
      }
    }
  };
  const wanted = required.flatMap(entry => (entry.classes ?? []).map(name => ({
    namespace: entry.namespace,
    name
  })));
  return packageJsonWithBindings({
    original: JSON.stringify(started, null, 2).replaceAll("\n", newline),
    wanted
  });
}

// The app's own winapp, then PATH's.
function winappCommand({ directory, winapp }: SetupOptions) {
  const isNamed = winapp !== undefined;
  if (isNamed) {
    return winapp;
  }

  const local = path.join(directory, "node_modules", ".bin", "winapp.cmd");
  return existsSync(local) ? local : "winapp";
}

function runWinapp({ command, directory, args }: {
  command: string;
  directory: string;
  args: string[];
}) {
  process.stdout.write(`> winapp ${args.join(" ")}\n`);
  // A .cmd shim needs a shell on Windows.
  execFileSync(command, args, {
    cwd: directory,
    stdio: "inherit",
    shell: true
  });
}

/**
 * Prepares the app in `directory` to use the package's controls: writes
 * `winapp.yaml` (when the app has none) and `package.json`, then runs winapp
 * to restore the SDK and generate the bindings, unless `isDryRun`.
 */
export function setup(options: SetupOptions) {
  const yamlPath = path.join(options.directory, WINAPP_FILE);
  if (!existsSync(yamlPath)) {
    writeFileSync(yamlPath, WINAPP_YAML);
    process.stdout.write(`wrote ${WINAPP_FILE}\n`);
  }

  const packagePath = path.join(options.directory, "package.json");
  const original = readFileSync(packagePath, "utf8");
  writeFileSync(
    packagePath, packageJsonForApp({
      original,
      required: requiredBindings()
    })
  );
  process.stdout.write("package.json: winapp.jsBindings and the @winapp/bindings dependency are in place\n");

  const { directory, isDryRun } = options;
  const isDryRunRequested = isDryRun === true;
  if (isDryRunRequested) {
    return;
  }

  const command = winappCommand(options);
  runWinapp({
    command,
    directory,
    args: ["restore"]
  });
  runWinapp({
    command,
    directory,
    args: ["node", "generate-bindings"]
  });
  process.stdout.write("done: run your package manager's install once more to link @winapp/bindings\n");
}
