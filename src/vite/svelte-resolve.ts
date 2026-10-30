import type { ResolveFnOutput, ResolveHookContext } from "node:module";
import path from "node:path";
import { pathToFileURL } from "node:url";

const BROWSER_CONDITION = "browser";
const SVELTE_SPECIFIER = "svelte";
/**
 * The environment variable that points the loader at another installation of
 * Svelte (a folder with `node_modules/svelte` in it), for the compatibility
 * matrix (`pnpm check:svelte-matrix`).
 */
export const SVELTE_ROOT_ENV = "WINUI_SVELTE_SVELTE_ROOT";
const svelteFolder = /[\\/]node_modules[\\/](?:svelte|esm-env)[\\/]/u;

function isSvelteImport({ specifier, parentUrl }: {
  specifier: string;
  parentUrl: string | undefined;
}) {
  const isSveltePackage = specifier === SVELTE_SPECIFIER || specifier.startsWith(`${SVELTE_SPECIFIER}/`);
  return isSveltePackage || svelteFolder.test(parentUrl ?? "");
}

function svelteRootParent() {
  const root = process.env[SVELTE_ROOT_ENV];
  return root ? pathToFileURL(path.resolve(root, "package.json")).href : undefined;
}

/**
 * The resolve hook alone: Svelte resolves to its browser build, from the
 * installation `WINUI_SVELTE_SVELTE_ROOT` names when it is set.
 */
// eslint-disable-next-line no-restricted-syntax -- the signature of Node's resolve hook
export function resolveSvelte(
  specifier: string,
  context: ResolveHookContext,
  nextResolve: (specifier: string, context?: Partial<ResolveHookContext>) => ResolveFnOutput
) {
  const isSvelte = isSvelteImport({
    specifier,
    parentUrl: context.parentURL
  });
  if (!isSvelte) {
    return nextResolve(specifier, context);
  }

  const parentURL = svelteRootParent();
  const isEntry = parentURL !== undefined && !svelteFolder.test(context.parentURL ?? "");
  return nextResolve(specifier, {
    ...context,
    ...isEntry && {
      parentURL
    },
    conditions: [...context.conditions, BROWSER_CONDITION]
  });
}
