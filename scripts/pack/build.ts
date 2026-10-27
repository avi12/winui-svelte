import { filesIn } from "../files-in.ts";
import { spawnSync } from "node:child_process";
import {
  copyFileSync,
  mkdirSync,
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

const packageRoot = path.join(import.meta.dirname, "..", "..");
const sourceFolder = path.join(packageRoot, "src");
const outputFolder = path.join(packageRoot, "dist");
const copiedExtensions = [".svelte", ".json"];
const declarationSuffix = ".d.svelte.ts";
// `from "./x.ts"` and `import("./x.ts")` in a .svelte script.
const relativeTsImport = /(["'])(\.{1,2}\/[^"']*?)\.ts\1/gu;
// `from "#src/x/y.js"`: package.json's `imports` maps #src/*.js to src/*.ts,
// which a published package does not have, so the build points each at dist/
// instead. (Written .js, because TypeScript refuses to leave a non-relative
// .ts import unrewritten.)
const sourceAliasImport = /(["'])#src\/([^"']*?)(\.js|\.svelte|\.json)\1/gu;
const aliasedExtensions = [".js", ".ts", ".svelte"];

function isShipped(file: string): boolean {
  const isDeclaration = file.endsWith(declarationSuffix);
  const isCopied = copiedExtensions.includes(path.extname(file));
  const isTestSupport = /\.fixture\.svelte$|\.test\./u.test(file);
  return (isDeclaration || isCopied) && !isTestSupport;
}

// A .svelte file's imports of .ts modules, as the .js they are compiled to; a
// .d.svelte.ts import is a type and stays.
function withCompiledImports(source: string): string {
  function compiledImport(whole: string, quote: string, target: string): string {
    return target.endsWith(".d.svelte") ? whole : `${quote}${target}.js${quote}`;
  }

  return source.replaceAll(relativeTsImport, compiledImport);
}

// `#src/x/y.js` as the path from the file to dist/x/y.js: the same specifier,
// relative, which TypeScript finds as y.d.ts and Node as y.js.
function withRelativeAliases({ file, source }: { file: string; source: string }) {
  function relativeImport(_whole: string, quote: string, target: string, extension: string) {
    const relative = path.relative(path.dirname(file), path.join(outputFolder, target)).replaceAll("\\", "/");
    const specifier = relative.startsWith(".") ? relative : `./${relative}`;
    return `${quote}${specifier}${extension}${quote}`;
  }

  return source.replaceAll(sourceAliasImport, relativeImport);
}

function resolveSourceAliases() {
  const files = filesIn(outputFolder).filter(file => aliasedExtensions.includes(path.extname(file)));
  for (const file of files) {
    const source = readFileSync(file, "utf8");
    if (source.includes("#src/")) {
      writeFileSync(file, withRelativeAliases({ file, source }));
    }
  }
}

function copyShipped(): void {
  for (const file of filesIn(sourceFolder).filter(isShipped)) {
    const target = path.join(outputFolder, path.relative(sourceFolder, file));
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
  const result = spawnSync(process.execPath, [tsc, "-p", path.join(packageRoot, "tsconfig.build.json")], {
    cwd: packageRoot,
    stdio: "inherit"
  });
  const isFailed = result.status !== 0 && result.status !== TSC_EMITTED_WITH_ERRORS;
  if (isFailed) {
    throw new Error(`tsc failed with exit code ${result.status}`);
  }
}

rmSync(outputFolder, {
  recursive: true,
  force: true
});
compile();
copyShipped();
resolveSourceAliases();
process.stdout.write(`dist: ${filesIn(outputFolder).length} files\n`);
