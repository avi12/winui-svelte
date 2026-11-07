import { isInsideFolder } from "./discover.ts";
import { extractTrayManifest } from "./extract-tray.ts";
import { TRAY_VIRTUAL_ID, trayModule } from "./tray-module.ts";
import { TRAY_BUNDLE_FILE, TRAY_MANIFEST_FILE } from "#src/tray/tray-manifest.js";
import { hasSideEffects, NATIVE_MODULE } from "#src/vite/externals.js";
import { copyFileSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import type { InlineConfig } from "vite";
import { build, mergeConfig } from "vite";

/** What `buildTray` needs. */
export interface BuildTrayOptions {
  /** The app's folder. */
  root: string;
  /** The absolute path of `entrypoints/tray.ts`. */
  file: string;
  /** Where `tray.js`, `tray.json` and the icon are written. */
  outDirectory: string;
  /** Whether to empty `outDirectory` first. */
  isFirst: boolean;
  isMinified: boolean;
  /** Vite settings merged over these. */
  config?: InlineConfig | undefined;
}

/**
 * Builds the tray of an app into its own small bundle: `tray.js`, which
 * starts the tray in a process of its own, `tray.json` (what the build read
 * from the file's literals) and the icon, copied at the path the file wrote it,
 * relative to the file. Svelte and the window runtime are not in it.
 *
 * @param options - The tray file and where to write.
 * @returns The names of the files written, relative to `outDirectory`.
 * @throws {Error} When the file is not a readable `defineTray`, or its icon leaves its folder.
 */
export async function buildTray({ root, file, outDirectory, isFirst, isMinified, config = {} }: BuildTrayOptions) {
  const manifest = extractTrayManifest(readFileSync(file, "utf8"));
  const source = path.resolve(path.dirname(file), manifest.icon);
  const isIconInside = isInsideFolder({
    folder: path.dirname(file),
    file: source
  });
  if (!isIconInside) {
    throw new Error(`the tray icon "${manifest.icon}" must be a file inside the folder of the tray entrypoint`);
  }

  await build(
    mergeConfig({
      configFile: false,
      root,
      logLevel: "warn",
      plugins: [trayModule(file)],
      ssr: {
        noExternal: true
      },
      build: {
        ssr: true,
        outDir: outDirectory,
        emptyOutDir: isFirst,
        minify: isMinified,
        target: "node24",
        rollupOptions: {
          external: [NATIVE_MODULE],
          treeshake: {
            moduleSideEffects: hasSideEffects
          },
          input: {
            tray: TRAY_VIRTUAL_ID
          },
          output: {
            format: "es",
            entryFileNames: "[name].js",
            codeSplitting: false
          }
        }
      }
    } satisfies InlineConfig, config)
  );
  const iconTarget = path.join(outDirectory, manifest.icon);
  mkdirSync(path.dirname(iconTarget), { recursive: true });
  copyFileSync(source, iconTarget);
  writeFileSync(path.join(outDirectory, TRAY_MANIFEST_FILE), `${JSON.stringify(manifest, undefined, 2)}\n`);
  return [TRAY_BUNDLE_FILE, TRAY_MANIFEST_FILE, path.normalize(manifest.icon)];
}
