import { extraPackages } from "#scripts/codegen/tables.ts";
import { filesIn } from "#scripts/files-in.ts";
import {
  copyShippedFile,
  isAliasedFile,
  isShipped,
  OUTPUT_FOLDER,
  PACKAGE_ROOT,
  resolveAliasesIn,
  SOURCE_FOLDER
} from "#scripts/pack/dist-files.ts";
import { WINAPP_BINARIES, WINAPP_BINDINGS } from "#scripts/winapp-paths.ts";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import {
  copyFileSync,
  cpSync,
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
const LOCKED_CODES = new Set(["EPERM", "EBUSY"]);

function isLocked(error: unknown) {
  return error instanceof Error && "code" in error && typeof error.code === "string" && LOCKED_CODES.has(error.code);
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
      const isKept = isLocked(error) || (error instanceof Error && "code" in error && error.code === "ENOTEMPTY");
      if (!isKept) {
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
  cpSync(GENERATED_BINDINGS, SHIPPED_BINDINGS, { recursive: true });
  writeFileSync(
    path.join(SHIPPED_BINDINGS, "package.json"), `${JSON.stringify(bindingsManifest, null, 2)}
`
  );
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

// tsc exits 2 when it reports type errors but still emitted. The type check
// belongs to `pnpm check` (and so to lint, which every release runs), so the
// build only fails when nothing was emitted: that way an area's refactor can be
// built and tested while another area still has type errors to fix.
const TSC_EMITTED_WITH_ERRORS = 2;

function compile() {
  const tsc = createRequire(import.meta.url).resolve("typescript/bin/tsc");
  const result = spawnSync(process.execPath, [tsc, "-p", path.join(PACKAGE_ROOT, "tsconfig.build.json")], {
    cwd: PACKAGE_ROOT,
    stdio: "inherit"
  });
  const isFailed = result.status !== 0 && result.status !== TSC_EMITTED_WITH_ERRORS;
  if (isFailed) {
    throw new Error(`tsc failed with exit code ${result.status}`);
  }
}

// What dist/ is made from: the sources, the bindings and libraries, and the
// files that decide how they are compiled and copied (size and modification
// time of each, so a checkout or an edit rebuilds). When it matches the stamp
// of the last build and dist/ is still there, the build has nothing to do:
// lint, test and the package check each ask for a build, and only one pays.
const STAMP_FILE = path.join(PACKAGE_ROOT, ".verify", "build-stamp");
const FORCE_FLAG = "--force";
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
const IS_UP_TO_DATE = !process.argv.includes(FORCE_FLAG)
  && existsSync(path.join(OUTPUT_FOLDER, "index.js"))
  && existsSync(STAMP_FILE)
  && readFileSync(STAMP_FILE, "utf8") === STAMP;
if (IS_UP_TO_DATE) {
  process.stdout.write("dist: up to date (pnpm build --force rebuilds)\n");
  process.exit(0);
}

rmSync(STAMP_FILE, { force: true });
clearFolder(OUTPUT_FOLDER);
copyBindings();
compile();
copyShipped();
copyBootstrappers();
resolveSourceAliases();
mkdirSync(path.dirname(STAMP_FILE), { recursive: true });
writeFileSync(STAMP_FILE, STAMP);
process.stdout.write(`dist: ${filesIn(OUTPUT_FOLDER).length} files\n`);
