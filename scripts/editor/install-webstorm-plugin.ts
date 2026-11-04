// Builds the WebStorm plugin (ide/webstorm) and unpacks it into the plugins
// folder of the developer's own WebStorm, so that the next start of the IDE
// loads it.
//
//   node scripts/editor/install-webstorm-plugin.ts [--skip-build]
//
// It never closes or restarts WebStorm: while one runs, the plugin's jar is in
// use, so the script builds, prints the zip and exits 2 without writing into
// the IDE's folder. Close WebStorm yourself, run it again with --skip-build,
// then start WebStorm. This is the only script that writes outside the
// repository, and only when someone asks for the plugin to be installed.
import { installPlugin } from "#scripts/editor/webstorm/isolated-ide.ts";
import { findSveltePlugin, findUserPluginsFolder, findWebStorm } from "#scripts/editor/webstorm/locate.ts";
import { buildPlugin, builtZip, PLUGIN_FOLDER_NAME } from "#scripts/editor/webstorm/plugin-build.ts";
import { spawnSync } from "node:child_process";
import { parseArgs } from "node:util";

const WEBSTORM_PROCESS = "webstorm64.exe";
const STILL_RUNNING_EXIT_CODE = 2;

function isWebStormRunning() {
  const listed = spawnSync("tasklist", ["/FI", `IMAGENAME eq ${WEBSTORM_PROCESS}`, "/FO", "CSV", "/NH"], { encoding: "utf8" });
  return listed.stdout.toLowerCase().includes(WEBSTORM_PROCESS);
}

function main() {
  const { values } = parseArgs({
    options: {
      "skip-build": {
        type: "boolean",
        default: false
      }
    }
  });
  const ideHome = findWebStorm();
  const sveltePlugin = findSveltePlugin();
  const pluginsFolder = findUserPluginsFolder();
  const isInstalled = ideHome !== undefined && sveltePlugin !== undefined && pluginsFolder !== undefined;
  if (!isInstalled) {
    console.error("WebStorm, its Svelte plugin or its config folder was not found on this machine.");
    process.exitCode = 1;
    return;
  }

  const isBuilt = values["skip-build"] || buildPlugin({
    paths: {
      ideHome,
      sveltePlugin
    },
    tasks: ["buildPlugin"]
  });
  const zipPath = builtZip();
  const isReady = isBuilt && zipPath !== undefined;
  if (!isReady) {
    console.error("The plugin did not build.");
    process.exitCode = 1;
    return;
  }

  if (isWebStormRunning()) {
    console.log(`WebStorm is running, so nothing was installed. Close WebStorm, then run this again with --skip-build, or install ${zipPath} with Settings > Plugins > Install Plugin from Disk.`);
    process.exitCode = STILL_RUNNING_EXIT_CODE;
    return;
  }

  installPlugin({
    zipPath,
    folderName: PLUGIN_FOLDER_NAME,
    pluginsFolder
  });
  console.log(`Installed ${zipPath} into ${pluginsFolder}; start WebStorm to load it.`);
}

main();
