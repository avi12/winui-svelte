import { windowConfig, winuiSvelte } from "./plugin.ts";
import { writeRuntimeKit } from "./runtime-kit.ts";
import type { InlineConfig } from "vite";
import { build, mergeConfig } from "vite";

/** What `buildApp` needs to know about the app. */
export interface BuildAppOptions {
  /** The app's folder: entries and the output are paths from here. */
  root: string;
  /**
   * The modules to build, by the name of the file each becomes: the host's
   * `main` and the UI thread's worker file are two entries
   * (`{ main: "main.ts", window: "window.ts" }` writes `main.js` and
   * `window.js` next to each other, so `new Worker("window.js")` finds it).
   */
  entries: Record<string, string>;
  /** Where the files are written; emptied first. Each entry is one self-contained file. */
  outDirectory: string;
  /** Whether to minify. Off by default: the Win2D overloads read parameter names, which a minifier renames. */
  isMinified?: boolean;
  /** Vite settings merged over these, for an `alias` or another plugin. */
  config?: InlineConfig;
}

// The native module is loaded by Node, from the node_modules the build writes
// beside the bundle (runtime-kit.ts); its subpaths are imports too.
const NATIVE_MODULE = /^@microsoft\/dynwinrt(?:\/|$)/u;

// One build per entry, each a single file: the host's main thread and the UI
// thread's worker are separate JavaScript realms and cannot share a module, and
// a chunk both shared would import the host's entry, which would run it again
// inside the worker.
function configOf({ root, name, file, outDirectory, isMinified, isFirst }: {
  root: string;
  name: string;
  file: string;
  outDirectory: string;
  isMinified: boolean;
  isFirst: boolean;
}) {
  const { resolve } = windowConfig();
  const conditions = resolve?.conditions ?? [];
  const config: InlineConfig = {
    configFile: false,
    root,
    logLevel: "warn",
    plugins: [winuiSvelte()],
    resolve: {
      conditions
    },
    ssr: {
      noExternal: true,
      resolve: {
        conditions
      }
    },
    build: {
      ssr: true,
      outDir: outDirectory,
      emptyOutDir: isFirst,
      minify: isMinified,
      target: "node24",
      rollupOptions: {
        external: [NATIVE_MODULE],
        input: {
          [name]: file
        },
        output: {
          format: "es",
          entryFileNames: "[name].js",
          codeSplitting: false
        }
      }
    }
  };
  return config;
}

/**
 * Builds the app for Node alone: every module, Svelte's runtime and the
 * package included, becomes plain JavaScript in `outDirectory`, one file per
 * entry, so `node main.js` starts the app with no Vite dev server and no
 * Svelte compiler. The components and the package's rune modules are compiled
 * for the client (the renderer draws through the tree), Svelte resolves to
 * its browser build (the one that mounts). What the app reads at run time is
 * written beside the bundle, so the output folder runs on its own, with no
 * `node_modules` of the app and no copy of this package: `@microsoft/dynwinrt`,
 * the native module (an import Node resolves from the `node_modules` in that
 * folder), the Windows App SDK bootstrapper in `bin/<arch>` and the resource
 * catalogue in `css`. They are for the architecture of the machine that builds.
 *
 * @param options - The app's folder, entries and output.
 * @returns The names of the files written, relative to `outDirectory`.
 */
export async function buildApp({ root, entries, outDirectory, isMinified = false, config = {} }: BuildAppOptions) {
  const files: string[] = [];
  for (const [i, [name, file]] of Object.entries(entries).entries()) {
    const result = await build(
      mergeConfig(
        configOf({
          root,
          name,
          file,
          outDirectory,
          isMinified,
          isFirst: i === 0
        }), config
      )
    );
    const outputs = Array.isArray(result) ? result : [result];
    files.push(...outputs.flatMap(output => "output" in output ? output.output.map(item => item.fileName) : []));
  }

  writeRuntimeKit(outDirectory);
  return files;
}
