// Builds the VS Code extension (ide/vscode) and installs it into the
// developer's own VS Code:
//
//   node scripts/editor/install-vscode-extension.ts [--skip-build]
//
// VS Code loads the extension when its window is reloaded (Developer: Reload
// Window); this script never closes or restarts it. It writes outside the
// repository, and only when someone asks for the extension to be installed.
import { buildExtension, builtVsix, VERSION_FILE } from "#scripts/editor/vscode/extension-build.ts";
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { parseArgs } from "node:util";
import { z } from "zod";

async function main() {
  const { values } = parseArgs({
    options: {
      "skip-build": {
        type: "boolean",
        default: false
      }
    }
  });
  const isBuilt = values["skip-build"] || await buildExtension();
  if (!isBuilt) {
    console.error("The VS Code extension did not build.");
    process.exitCode = 1;
    return;
  }

  const { version } = z.object({ version: z.string() }).parse(JSON.parse(readFileSync(VERSION_FILE, "utf8")));
  const vsix = builtVsix(version);
  const installed = spawnSync("code", ["--install-extension", `"${vsix}"`, "--force"], {
    stdio: "inherit",
    shell: true
  });
  const isInstalled = installed.status === 0;
  console.log(isInstalled ? `Installed ${vsix}; reload the VS Code window to load it.` : "VS Code's `code` command failed.");
  process.exitCode = isInstalled ? 0 : 1;
}

await main();
