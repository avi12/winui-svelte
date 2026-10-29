import { compileSvelte, isSvelteFile } from "./compile.ts";
import { isPatchedRuntime, patchSvelteRuntime } from "./runtime-patch.ts";
import { readFileSync } from "node:fs";
import type { RegisterHooksOptions } from "node:module";
import { fileURLToPath } from "node:url";

const BROWSER_CONDITION = "browser";
const SVELTE_SPECIFIER = "svelte";
const svelteFolder = /[\\/]node_modules[\\/]svelte[\\/]/u;

function isSvelteImport({ specifier, parentUrl }: {
  specifier: string;
  parentUrl: string | undefined;
}) {
  const isSveltePackage = specifier === SVELTE_SPECIFIER || specifier.startsWith(`${SVELTE_SPECIFIER}/`);
  return isSveltePackage || svelteFolder.test(parentUrl ?? "");
}

/**
 * Node module hooks that run `.svelte` files from source: Svelte resolves to
 * its browser build, the one that mounts components, and a `.svelte` file is
 * compiled as it loads, and the files of Svelte's runtime the package reads
 * with edits are edited (`runtime-patch.ts`). The window itself runs from
 * source through the Vite dev server instead (`server.ts`).
 */
export function svelteHooks() {
  const hooks: RegisterHooksOptions = {
    resolve(specifier, context, nextResolve) {
      const isSvelte = isSvelteImport({
        specifier,
        parentUrl: context.parentURL
      });
      if (!isSvelte) {
        return nextResolve(specifier, context);
      }

      return nextResolve(specifier, {
        ...context,
        conditions: [...context.conditions, BROWSER_CONDITION]
      });
    },
    load(url, context, nextLoad) {
      if (!isSvelteFile(url)) {
        const loaded = nextLoad(url, context);
        const isPatched = isPatchedRuntime(url) && loaded.source != null;
        return isPatched ? {
          ...loaded,
          source: patchSvelteRuntime({
            filename: url,
            source: String(loaded.source)
          })
        } : loaded;
      }

      const filename = fileURLToPath(url);
      return {
        format: "module",
        source: compileSvelte({
          filename,
          source: readFileSync(filename, "utf8")
        }),
        shortCircuit: true
      };
    }
  };
  return hooks;
}
