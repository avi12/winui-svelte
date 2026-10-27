import { WINUI_RENDERER } from "./compile.ts";
import { assertCustomRendererSvelte } from "./custom-svelte.ts";
import type { Options } from "@sveltejs/vite-plugin-svelte";
import { svelte } from "@sveltejs/vite-plugin-svelte";
import { cssHash } from "#src/css/runtime/sheet-module.js";
import { winuiCss } from "#src/css/vite.js";
import type { CompileOptions } from "svelte/compiler";
import type { Plugin, UserConfig } from "vite";

/** What `winuiSvelte()` takes. */
export interface WinuiSvelteOptions {
  /** The module a component imports its renderer from; default winui-svelte/host. */
  renderer?: string;
}

/** What the plugin passes on to Svelte's own Vite plugin, without Vite. */
export interface PluginOptions {
  svelte: Options;
  /** What every component is compiled with, on top of its own settings. */
  compile: CompileOptions;
}

/**
 * The environment the window's modules load in, which only the module runner
 * of the window thread uses.
 */
export const WINDOW_ENVIRONMENT = "winui";

const BROWSER_CONDITIONS = ["browser"];
// Svelte and esm-env pick their builds by condition, and winui-svelte is
// source, so Vite compiles them for the runner rather than leaving them to
// Node.
const compiledPackages = [/^svelte(?:\/|$)/u, "esm-env", "winui-svelte"];

/** What the plugin passes on, without Vite: kept apart so it can be checked. */
export function winuiPluginOptions(options: WinuiSvelteOptions = {}) {
  const compile: CompileOptions = {
    // The runner is Node, so the environment is a server one, but the window
    // mounts components: they compile for the client.
    generate: "client",
    // The scoping class a component's elements carry and its <style>'s
    // selectors name must agree (see css/sheet-module.ts).
    cssHash,
    experimental: {
      customRenderer: options.renderer ?? WINUI_RENDERER
    }
  };
  const svelteOptions: Options = {
    configFile: false,
    // WinUI has no stylesheets, and a custom renderer takes no injected
    // CSS.
    emitCss: false,
    compilerOptions: {
      css: "external"
    },
    dynamicCompileOptions: () => compile
  };
  return {
    compile,
    svelte: svelteOptions
  };
}

/** The Vite settings the window's modules need. */
export function windowConfig() {
  const config: UserConfig = {
    // Svelte's browser build is the one that mounts components.
    resolve: {
      conditions: BROWSER_CONDITIONS
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
          conditions: [...BROWSER_CONDITIONS, "development"],
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
 * The one line in an app's Vite config: `plugins: [winuiSvelte()]`. It is
 * Svelte's own Vite plugin, told to compile components for the client
 * against the WinUI renderer, plus the module environment the window's
 * modules load in (see `server.ts` for the dev server that uses it).
 */
export function winuiSvelte(options: WinuiSvelteOptions = {}) {
  assertCustomRendererSvelte();
  const environment: Plugin = {
    name: "winui-svelte:environment",
    config: windowConfig
  };
  const { svelte: svelteOptions, compile } = winuiPluginOptions(options);
  // A component's <style> becomes WinUI Styles its module registers; a rule
  // WinUI cannot say is reported, and the open window keeps running.
  const css = winuiCss({
    compilerOptions: compile,
    onError: "report"
  });
  return [environment, ...svelte(svelteOptions), css];
}
