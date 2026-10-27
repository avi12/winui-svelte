import { exportAliases, ExportTarget } from "#scripts/export-aliases.ts";
import { winuiSvelte } from "#src/vite/plugin.js";
import { defineConfig } from "vite";

// What the examples' and the mount test's module server read: the plugin, and
// the package's own specifiers pointed at its sources. package.json's exports
// name the built files, which a consumer gets; inside the repository the same
// modules are also imported by path from src, and one module must not load
// twice (the renderer's registry would split in two).
export default defineConfig({
  plugins: [winuiSvelte()],
  resolve: {
    alias: exportAliases(ExportTarget.SOURCE)
  }
});
