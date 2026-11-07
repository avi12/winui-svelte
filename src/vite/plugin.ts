import { barrelImports } from "./barrel.ts";
import { WINUI_COMPILE_OPTIONS } from "./compile.ts";
import { trayDevelopmentPlugin } from "./entrypoints/tray-dev-plugin.ts";
import { hasSideEffects } from "./externals.ts";
import { svelteCompiler } from "./svelte-plugin.ts";
import { winuiCss } from "#src/css/vite.js";
import type { CompileOptions } from "svelte/compiler";
import type { Plugin, UserConfig } from "vite";

/** What the plugin compiles every component with, without Vite. */
export interface PluginOptions {
  compile: CompileOptions;
}

/**
 * The environment the window's modules load in, which only the module runner
 * of the window thread uses.
 */
export const WINDOW_ENVIRONMENT = "winui";

const BROWSER_CONDITIONS = ["browser"];
// A Svelte library names its component entry under this condition.
const SVELTE_CONDITION = "svelte";
// Svelte and esm-env pick their builds by condition, and winui-svelte is
// source, so Vite compiles them for the runner rather than leaving them to
// Node.
const compiledPackages = [/^svelte(?:\/|$)/u, "esm-env", "winui-svelte"];
// One copy of Svelte: an app that links this package (a workspace or a link:
// dependency) resolves its own Svelte and the package's own, and components
// from one would register on a runtime the renderer of the other never sees.
const DEDUPED_PACKAGES = ["svelte"];

/** What the plugin compiles with, without Vite: kept apart so it can be checked. */
export function winuiPluginOptions() {
  const options: PluginOptions = {
    compile: {
      ...WINUI_COMPILE_OPTIONS
    }
  };
  return options;
}

/** The Vite settings the window's modules need. */
export function windowConfig() {
  const config: UserConfig = {
    // Svelte's browser build is the one that mounts components.
    resolve: {
      conditions: [...BROWSER_CONDITIONS, SVELTE_CONDITION],
      dedupe: DEDUPED_PACKAGES
    },
    build: {
      rollupOptions: {
        treeshake: {
          moduleSideEffects: hasSideEffects
        }
      }
    },
    // Nothing runs in a browser, so there is nothing to pre-bundle for one.
    optimizeDeps: {
      noDiscovery: true,
      include: []
    },
    environments: {
      [WINDOW_ENVIRONMENT]: {
        consumer: "server",
        resolve: {
          conditions: [...BROWSER_CONDITIONS, SVELTE_CONDITION, "development"],
          dedupe: DEDUPED_PACKAGES,
          noExternal: compiledPackages
        },
        dev: {
          moduleRunnerTransform: true
        }
      }
    }
  };
  return config;
}

/**
 * The one line in an app's Vite config: `plugins: [winuiSvelte()]`. It
 * compiles components for the client with Svelte's own compiler, which
 * draws through the tree renderer, plus the module environment the window's
 * modules load in (see `server.ts` for the dev server that uses it).
 */
export function winuiSvelte() {
  const environment: Plugin = {
    name: "winui-svelte:environment",
    config: windowConfig
  };
  const { compile } = winuiPluginOptions();
  // A component's <style> becomes WinUI Styles its module registers; a rule
  // WinUI cannot say is reported under the dev server, and the open window
  // keeps running; a build fails on it.
  const css = winuiCss({
    compilerOptions: compile,
    onError: "report-when-serving"
  });
  return [environment, ...svelteCompiler(compile), css, barrelImports(), trayDevelopmentPlugin()];
}
