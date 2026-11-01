import { copyFileSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

// What turns a source file into the file dist/ holds, one file at a time: the
// build does it for all of them, and the watch build (dev.ts) for the one that
// changed.

export const PACKAGE_ROOT = path.join(import.meta.dirname, "..", "..");
export const SOURCE_FOLDER = path.join(PACKAGE_ROOT, "src");
export const OUTPUT_FOLDER = path.join(PACKAGE_ROOT, "dist");

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

export function isShipped(file: string) {
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

export function shippedTarget(file: string) {
  return path.join(OUTPUT_FOLDER, path.relative(SOURCE_FOLDER, file));
}

export function copyShippedFile(file: string) {
  const target = shippedTarget(file);
  mkdirSync(path.dirname(target), { recursive: true });
  const isMarkup = file.endsWith(".svelte");
  if (isMarkup) {
    writeFileSync(target, withCompiledImports(readFileSync(file, "utf8")));
    return;
  }

  copyFileSync(file, target);
}

export function isAliasedFile(file: string) {
  return aliasedExtensions.includes(path.extname(file));
}

export function resolveAliasesIn(file: string) {
  const source = readFileSync(file, "utf8");
  const isAliased = source.includes("#src/");
  if (isAliased) {
    writeFileSync(
      file, withRelativeAliases({
        file,
        source
      })
    );
  }
}
