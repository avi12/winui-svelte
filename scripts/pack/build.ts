import { extraPackages } from "#scripts/codegen/tables.ts";
import { filesIn } from "#scripts/files-in.ts";
import {
  copyShippedFile,
  isAliasedFile,
  isShipped,
  OUTPUT_FOLDER,
  PACKAGE_ROOT,
  resolveAliasesIn,
  SOURCE_FOLDER,
  writeIfChanged
} from "#scripts/pack/dist-files.ts";
import { WINAPP_BINARIES, WINAPP_BINDINGS } from "#scripts/winapp-paths.ts";
import { createHash } from "node:crypto";
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  rmdirSync,
  rmSync,
  statSync,
  unlinkSync,
  writeFileSync
} from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import typescript from "typescript";

// Builds dist/, what is published: the TypeScript compiled to JavaScript with
// its declarations (tsc), and the Svelte pieces shipped as source, the way
// Svelte libraries are, for the app's own Vite to compile with the custom
// renderer:
//
//   .svelte        the components, their relative imports pointing at the
//                  compiled .js files;
//   .d.svelte.ts   the types of the generated components, for TypeScript
//                  without the Svelte language tools;
//   *.svelte.js    modules with runes, which the app's Svelte plugin compiles;
//   .json          data the code reads next to itself.
//
// (@sveltejs/package, the usual tool, hands a *.d.svelte.ts file to TypeScript
// as source and fails, so tsc and a copy do it.)

// What `pnpm bindings` (winapp) generates from WinUI's metadata, and where
// package.json's `#winui/*` finds it once built. Shipped whole: they declare
// `"sideEffects": false`, so an app's bundler keeps only the controls it uses.
const GENERATED_BINDINGS = WINAPP_BINDINGS;
const SHIPPED_BINDINGS = path.join(OUTPUT_FOLDER, "bindings");
// The Windows App SDK bootstrapper `winapp restore` puts in .winapp/bin, per
// architecture, and where initWindowsAppSdk finds it once built.
const RESTORED_BOOTSTRAPPERS = WINAPP_BINARIES;
const SHIPPED_BOOTSTRAPPERS = path.join(OUTPUT_FOLDER, "bin");
// The native libraries the package carries per architecture: the Windows App
// SDK's bootstrapper, and what each extra package ships (extraPackages in
// scripts/codegen/tables.ts: the WebView2 and Win2D libraries, which
// scripts/bindings/after-winapp.ts and winapp put in .winapp/bin; arm64ec has
// none of them).
const BOOTSTRAPPER = "Microsoft.WindowsAppRuntime.Bootstrap.dll";
// The bindings are CommonJS, which a package.json of their own keeps them
// inside this ESM package. Only what applies to a nested package is written:
// its `exports` would be ignored there, and `#winui/*` reaches the files.
const bindingsManifest = {
  type: "commonjs",
  sideEffects: false
};

// A library a running app has loaded cannot be deleted or overwritten; the
// build leaves it where it is and copies over the rest, so a window that links
// this package can stay open while it is rebuilt.
const KEPT_CODES = new Set(["EPERM", "EBUSY", "ENOTEMPTY"]);

function isKept(error: unknown) {
  return error instanceof Error && "code" in error && typeof error.code === "string" && KEPT_CODES.has(error.code);
}

function clearFolder(folder: string) {
  if (!existsSync(folder)) {
    return;
  }

  for (const entry of readdirSync(folder, { withFileTypes: true })) {
    const entryPath = path.join(folder, entry.name);
    try {
      if (entry.isDirectory()) {
        clearFolder(entryPath);
        rmdirSync(entryPath);
      } else {
        unlinkSync(entryPath);
      }
    } catch (error) {
      if (!isKept(error)) {
        throw error;
      }
    }
  }
}

function copyLibrary({ source, target }: {
  source: string;
  target: string;
}) {
  const isAlreadyThere = existsSync(target) && readFileSync(target).equals(readFileSync(source));
  if (isAlreadyThere) {
    return;
  }

  copyFileSync(source, target);
}

function copyBindings() {
  const generated = filesIn(GENERATED_BINDINGS).filter(file => path.basename(file) !== "package.json");
  for (const file of generated) {
    writeIfChanged({
      file: path.join(SHIPPED_BINDINGS, path.relative(GENERATED_BINDINGS, file)),
      content: readFileSync(file)
    });
  }

  writeIfChanged({
    file: path.join(SHIPPED_BINDINGS, "package.json"),
    content: `${JSON.stringify(bindingsManifest, null, 2)}
`
  });
}

function copyExtraLibraries({ extra, architecture }: {
  extra: (typeof extraPackages)[number];
  architecture: string;
}) {
  const restoredLibraries = extra.libraries.filter(
    library => existsSync(path.join(RESTORED_BOOTSTRAPPERS, architecture, library))
  );
  const isPartial = restoredLibraries.length > 0 && restoredLibraries.length < extra.libraries.length;
  if (isPartial) {
    throw new Error(`${architecture} has only ${restoredLibraries.join(", ")} of ${extra.libraries.join(", ")} (${extra.name}): run pnpm bindings`);
  }

  for (const library of restoredLibraries) {
    copyLibrary({
      source: path.join(RESTORED_BOOTSTRAPPERS, architecture, library),
      target: path.join(SHIPPED_BOOTSTRAPPERS, architecture, library)
    });
  }
}

function copyBootstrappers() {
  for (const architecture of readdirSync(RESTORED_BOOTSTRAPPERS)) {
    const target = path.join(SHIPPED_BOOTSTRAPPERS, architecture);
    mkdirSync(target, { recursive: true });
    copyLibrary({
      source: path.join(RESTORED_BOOTSTRAPPERS, architecture, BOOTSTRAPPER),
      target: path.join(target, BOOTSTRAPPER)
    });
    for (const extra of extraPackages) {
      copyExtraLibraries({
        extra,
        architecture
      });
    }
  }
}

function copyShipped() {
  for (const file of filesIn(SOURCE_FOLDER).filter(isShipped)) {
    copyShippedFile(file);
  }
}

function resolveSourceAliases() {
  for (const file of filesIn(OUTPUT_FOLDER).filter(isAliasedFile)) {
    resolveAliasesIn(file);
  }
}

// The type check belongs to `pnpm check` (and so to lint, which every release
// runs), so the build only fails when nothing was emitted: that way an area's
// refactor can be built and tested while another area still has type errors to
// fix. Each output goes through writeIfChanged, so a file the change did not
// alter keeps its bytes and its time.
const ERROR_SEPARATOR = "\n";

function compile() {
  const configPath = path.join(PACKAGE_ROOT, "tsconfig.build.json");
  const config = typescript.getParsedCommandLineOfConfigFile(configPath, {}, {
    ...typescript.sys,
    onUnRecoverableConfigFileDiagnostic(diagnostic) {
      throw new Error(typescript.flattenDiagnosticMessageText(diagnostic.messageText, ERROR_SEPARATOR));
    }
  });
  const isUnreadable = config === undefined;
  if (isUnreadable) {
    throw new Error(`${configPath} could not be read`);
  }

  const program = typescript.createProgram({
    rootNames: config.fileNames,
    options: config.options
  });
  const result = program.emit(undefined, (file, content) => {
    writeIfChanged({
      file,
      content
    });
  });
  if (result.emitSkipped) {
    throw new Error("tsc emitted nothing");
  }
}

// Whether a file of dist/ still has a source: itself a shipped copy, or the
// compiled form (.js, .d.ts and their maps) of a .ts file.
function hasSource(file: string) {
  const relative = path.relative(OUTPUT_FOLDER, file);
  const isCopy = existsSync(path.join(SOURCE_FOLDER, relative));
  const compiledSuffix = COMPILED_SUFFIXES.find(suffix => relative.endsWith(suffix));
  const hasCompiledSource = compiledSuffix !== undefined
    && existsSync(path.join(SOURCE_FOLDER, `${relative.slice(0, -compiledSuffix.length)}.ts`));
  return isCopy || hasCompiledSource;
}

function isCopiedLibrary(file: string) {
  return KEPT_FOLDERS.some(folder => file.startsWith(folder + path.sep));
}

// A source that was removed or renamed leaves its output behind in an update in
// place, which the package would then ship.
function removeStale() {
  for (const file of filesIn(OUTPUT_FOLDER).filter(candidate => !isCopiedLibrary(candidate))) {
    if (!hasSource(file)) {
      rmSync(file, { force: true });
    }
  }
}

// What dist/ is made from: the sources, the bindings and libraries, and the
// files that decide how they are compiled and copied (size and modification
// time of each, so a checkout or an edit rebuilds). When it matches the stamp
// of the last build and dist/ is still there, the build has nothing to do:
// lint, test and the package check each ask for a build, and only one pays.
const STAMP_FILE = path.join(PACKAGE_ROOT, ".verify", "build-stamp");
const FORCE_FLAG = "--force";
const BUILD_INFO = path.join(PACKAGE_ROOT, ".verify", "build.tsbuildinfo");
// What dist/ holds that no source produces: the copied bindings and libraries.
const KEPT_FOLDERS = [SHIPPED_BINDINGS, SHIPPED_BOOTSTRAPPERS];
const COMPILED_SUFFIXES = [".d.ts.map", ".d.ts", ".js.map", ".js"];
const BUILD_INPUTS = [
  SOURCE_FOLDER,
  GENERATED_BINDINGS,
  RESTORED_BOOTSTRAPPERS,
  path.join(PACKAGE_ROOT, "scripts", "pack", "build.ts"),
  path.join(PACKAGE_ROOT, "scripts", "codegen", "tables.ts"),
  path.join(PACKAGE_ROOT, "tsconfig.json"),
  path.join(PACKAGE_ROOT, "tsconfig.build.json"),
  path.join(PACKAGE_ROOT, "package.json")
];

function filesOf(input: string) {
  const isFolder = statSync(input, { throwIfNoEntry: false })?.isDirectory() === true;
  return isFolder ? filesIn(input) : [input];
}

function inputsStamp() {
  const hash = createHash("sha256");
  const typescriptVersion = createRequire(import.meta.url)("typescript/package.json").version;
  hash.update(`${process.version} ${typescriptVersion}\n`);
  for (const file of BUILD_INPUTS.flatMap(filesOf)) {
    const stat = statSync(file, { throwIfNoEntry: false });
    hash.update(`${file} ${stat?.size} ${stat?.mtimeMs}\n`);
  }

  return hash.digest("hex");
}

const STAMP = inputsStamp();
const IS_FORCED = process.argv.includes(FORCE_FLAG);
const HAS_OUTPUT = existsSync(path.join(OUTPUT_FOLDER, "index.js"));
const IS_UP_TO_DATE = !IS_FORCED
  && HAS_OUTPUT
  && existsSync(STAMP_FILE)
  && readFileSync(STAMP_FILE, "utf8") === STAMP;
if (IS_UP_TO_DATE) {
  process.stdout.write("dist: up to date (pnpm build --force rebuilds)\n");
  process.exit(0);
}

// dist/ is updated in place, and a file whose bytes did not change is not
// written: the editor that indexes dist/ through a link reanalyzes only what
// this build changed. tsc's own record of what it emitted (BUILD_INFO) is only
// true while dist/ is as it left it, so a rebuild from nothing drops it.
const IS_FROM_NOTHING = IS_FORCED || !HAS_OUTPUT;
rmSync(STAMP_FILE, { force: true });

if (IS_FROM_NOTHING) {
  rmSync(BUILD_INFO, { force: true });
  clearFolder(OUTPUT_FOLDER);
}

copyBindings();
compile();
copyShipped();
copyBootstrappers();
resolveSourceAliases();
removeStale();
mkdirSync(path.dirname(STAMP_FILE), { recursive: true });
writeFileSync(STAMP_FILE, STAMP);
process.stdout.write(`dist: ${filesIn(OUTPUT_FOLDER).length} files\n`);
