import { SVELTE_EXTENSION, traySourceOf } from "./tray-source.ts";
import { stripTypeScriptTypes } from "node:module";
import path from "node:path";
import type { Plugin } from "vite";
import { normalizePath } from "vite";

/** The id Rollup builds `tray.js` from: a module the build writes, not a file of the app. */
export const TRAY_VIRTUAL_ID = "virtual:winui-svelte/tray";

const RESOLVED_ID = `\0${TRAY_VIRTUAL_ID}`;

/**
 * The source of `tray.js` before bundling: it imports the user's default
 * export and starts it, once per `guid`, so `entrypoints/tray.ts` imports no
 * framework wiring.
 *
 * @param file - The absolute path of the user's `entrypoints/tray.ts`.
 * @returns The module's text.
 */
export function trayWrapperSource(file: string) {
  return [
    `import tray from ${JSON.stringify(file)};`,
    `import { claimTrayInstance } from "winui-svelte/app";`,
    `import { createStandaloneTray } from "winui-svelte/tray/standalone";`,
    ``,
    `if (claimTrayInstance({ guid: tray.guid })) {`,
    `  createStandaloneTray({ ...tray, onclick: tray.onclick ?? tray.onactivate });`,
    `}`,
    ``
  ].join("\n");
}

/**
 * Serves the wrapper of a tray entrypoint as a virtual module, like WXT's
 * virtual background entrypoint, and the lowered code of a `tray.svelte` as the
 * text of its file.
 *
 * @param file - The absolute path of the user's `entrypoints/tray.ts`.
 * @returns The Vite plugin.
 */
export function trayModule(file: string) {
  const isMarkup = path.extname(file) === SVELTE_EXTENSION;
  const plugin: Plugin = {
    name: "winui-svelte:tray-entrypoint",
    resolveId(id) {
      return id === TRAY_VIRTUAL_ID ? RESOLVED_ID : undefined;
    },
    load(id) {
      const isWrapper = id === RESOLVED_ID;
      if (isWrapper) {
        return trayWrapperSource(file);
      }

      const isLoweredFile = isMarkup && id === normalizePath(file);
      return isLoweredFile ? stripTypeScriptTypes(traySourceOf(file)) : undefined;
    }
  };
  return plugin;
}
