import { filesIn } from "#scripts/files-in.ts";
import { spawnSync } from "node:child_process";
import {
  copyFileSync,
  cpSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  rmSync,
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

const PACKAGE_ROOT = path.join(import.meta.dirname, "..", "..");
const SOURCE_FOLDER = path.join(PACKAGE_ROOT, "src");
const OUTPUT_FOLDER = path.join(PACKAGE_ROOT, "dist");
// What `pnpm bindings` (winapp) generates from WinUI's metadata, and where
// package.json's `#winui/*` finds it once built. Shipped whole: they declare
// `"sideEffects": false`, so an app's bundler keeps only the controls it uses.
const GENERATED_BINDINGS = path.join(PACKAGE_ROOT, ".winapp", "bindings");
const SHIPPED_BINDINGS = path.join(OUTPUT_FOLDER, "bindings");
// The Windows App SDK bootstrapper `winapp restore` puts in .winapp/bin, per
// architecture, and where initWindowsAppSdk finds it once built.
const RESTORED_BOOTSTRAPPERS = path.join(PACKAGE_ROOT, ".winapp", "bin");
const SHIPPED_BOOTSTRAPPERS = path.join(OUTPUT_FOLDER, "bin");
const BOOTSTRAPPER = "Microsoft.WindowsAppRuntime.Bootstrap.dll";
const copiedExtensions = [".svelte", ".json"];
const DECLARATION_SUFFIX = ".d.svelte.ts";
// `from "./x.ts"` and `import("./x.ts")` in a .svelte script.
const relativeTsImport = /(["'])(\.{1,2}\/[^"']*?)\.ts\1/gu;
// `from "#src/x/y.js"`: package.json's `imports` maps #src/*.js to src/*.ts,
// which a published package does not have, so the build points each at dist/
// instead. (Written .js, because TypeScript refuses to leave a non-relative
// .ts import unrewritten.)
const sourceAliasImport = /(["'])#src\/([^"']*?)(\.js|\.svelte|\.json)\1/gu;
const aliasedExtensions = [".js", ".ts", ".svelte"];

function isShipped(file: string) {
  const isDeclaration = file.endsWith(DECLARATION_SUFFIX);
  const isCopied = copiedExtensions.includes(path.extname(file));
  const isTestSupport = /\.fixture\.svelte$|\.test\./u.test(file);
  return (isDeclaration || isCopied) && !isTestSupport;
}

// A .svelte file's imports of .ts modules, as the .js they are compiled to; a
// .d.svelte.ts import is a type and stays.
function withCompiledImports(source: string) {
  return source.replaceAll(relativeTsImport, (whole: string, quote: string, target: string) => {
    const isDeclarationImport = target.endsWith(".d.svelte");
    return isDeclarationImport ? whole : `${quote}${target}.js${quote}`;
  });
}

// `#src/x/y.js` as the path from the file to dist/x/y.js: the same specifier,
// relative, which TypeScript finds as y.d.ts and Node as y.js.
function withRelativeAliases({ file, source }: {
  file: string;
  source: string;
}) {
  return source.replaceAll(sourceAliasImport, (_whole: string, quote: string, target: string, extension: string) => {
    const relative = path.relative(path.dirname(file), path.join(OUTPUT_FOLDER, target)).replaceAll("\\", "/");
    const specifier = relative.startsWith(".") ? relative : `./${relative}`;
    return `${quote}${specifier}${extension}${quote}`;
  });
}

function resolveSourceAliases() {
  const files = filesIn(OUTPUT_FOLDER).filter(file => aliasedExtensions.includes(path.extname(file)));
  for (const file of files) {
    const source = readFileSync(file, "utf8");
    if (source.includes("#src/")) {
      writeFileSync(
        file, withRelativeAliases({
          file,
          source
        })
      );
    }
  }
}

// The bindings are CommonJS, which a package.json of their own keeps them
// inside this ESM package. Only what applies to a nested package is written:
// its `exports` would be ignored there, and `#winui/*` reaches the files.
const bindingsManifest = {
  type: "commonjs",
  sideEffects: false
};

function copyBindings() {
  cpSync(GENERATED_BINDINGS, SHIPPED_BINDINGS, { recursive: true });
  writeFileSync(
    path.join(SHIPPED_BINDINGS, "package.json"), `${JSON.stringify(bindingsManifest, null, 2)}
`
  );
}

function copyBootstrappers() {
  for (const architecture of readdirSync(RESTORED_BOOTSTRAPPERS)) {
    const target = path.join(SHIPPED_BOOTSTRAPPERS, architecture);
    mkdirSync(target, { recursive: true });
    copyFileSync(path.join(RESTORED_BOOTSTRAPPERS, architecture, BOOTSTRAPPER), path.join(target, BOOTSTRAPPER));
  }
}

function copyShipped() {
  for (const file of filesIn(SOURCE_FOLDER).filter(isShipped)) {
    const target = path.join(OUTPUT_FOLDER, path.relative(SOURCE_FOLDER, file));
    mkdirSync(path.dirname(target), { recursive: true });

    if (file.endsWith(".svelte")) {
      writeFileSync(target, withCompiledImports(readFileSync(file, "utf8")));
    } else {
      copyFileSync(file, target);
    }
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

rmSync(OUTPUT_FOLDER, {
  recursive: true,
  force: true
});
compile();
copyShipped();
copyBindings();
copyBootstrappers();
resolveSourceAliases();
process.stdout.write(`dist: ${filesIn(OUTPUT_FOLDER).length} files\n`);
