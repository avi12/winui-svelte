// Bundles the VS Code extension (ide/vscode) into ide/vscode/dist/extension.js,
// the file its package.json names as `main`, and packs it as a .vsix next to it:
//
//   node scripts/editor/build-vscode-extension.ts
//
// The icon table is the WebStorm plugin's (fluent-glyphs.json, written by
// `pnpm gen:components`), so the two editors offer the same names.
import { build } from "esbuild";
import { spawnSync } from "node:child_process";
import path from "node:path";

const EXTENSION_ROOT = path.resolve(import.meta.dirname, "../../ide/vscode");

await build({
  entryPoints: [path.join(EXTENSION_ROOT, "src/extension.ts")],
  outfile: path.join(EXTENSION_ROOT, "dist/extension.js"),
  bundle: true,
  platform: "node",
  format: "cjs",
  target: "node22",
  external: ["vscode"],
  minify: true
});

const packed = spawnSync("pnpm", ["dlx", "@vscode/vsce", "package", "--no-dependencies", "--allow-missing-repository"], {
  cwd: EXTENSION_ROOT,
  stdio: "inherit",
  shell: true
});
process.exitCode = packed.status ?? 1;
