import { build } from "esbuild";
import { spawnSync } from "node:child_process";
import path from "node:path";

const EXTENSION_ROOT = path.resolve(import.meta.dirname, "../../../ide/vscode");
export const VERSION_FILE = path.join(EXTENSION_ROOT, "package.json");

export function builtVsix(version: string) {
  return path.join(EXTENSION_ROOT, `winui-svelte-vscode-${version}.vsix`);
}

export async function buildExtension() {
  await build({
    entryPoints: [path.join(EXTENSION_ROOT, "src/extension.ts")],
    outfile: path.join(EXTENSION_ROOT, "dist/extension.cjs"),
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
  return packed.status === 0;
}
