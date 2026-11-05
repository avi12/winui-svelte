// Finds what the WebStorm check needs on this machine, without a hardcoded
// path: the IDE itself and the Svelte plugin, which WebStorm does not bundle
// (it is installed from the JetBrains marketplace into the user's config).
import { spawnSync } from "node:child_process";
import {
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  writeFileSync
} from "node:fs";
import path from "node:path";

const INSPECT_SCRIPT = path.join("bin", "inspect.bat");
const WEBSTORM_FOLDER_PATTERN = /^WebStorm/i;
const TOOLBOX_CHANNEL_PATTERN = /^ch-/;
const VERSION_FOLDER_PATTERN = /^\d/;
const SVELTE_PLUGIN_FOLDER = "svelte";
const SVELTE_PLUGIN_ID = "dev.blachut.svelte.lang";
const MARKETPLACE_DOWNLOAD = "https://plugins.jetbrains.com/pluginManager";
const WINDOWS_TAR = path.join(process.env["SystemRoot"] ?? "", "System32", "tar.exe");
const SVELTE_CACHE = path.resolve(import.meta.dirname, "../../../.verify/svelte-plugin");

function newestFirst(names: string[]) {
  return names.toSorted((first, second) => second.localeCompare(first, undefined, { numeric: true }));
}

function foldersMatching({ parent, pattern }: {
  parent: string;
  pattern: RegExp;
}) {
  if (!existsSync(parent)) {
    return [];
  }

  const names = readdirSync(parent, { withFileTypes: true })
    .filter(entry => entry.isDirectory() && pattern.test(entry.name))
    .map(entry => entry.name);
  return newestFirst(names).map(name => path.join(parent, name));
}

function toolboxInstalls(localAppData: string) {
  const toolboxApps = path.join(localAppData, "JetBrains", "Toolbox", "apps", "WebStorm");
  return foldersMatching({
    parent: toolboxApps,
    pattern: TOOLBOX_CHANNEL_PATTERN
  }).flatMap(channel => foldersMatching({
    parent: channel,
    pattern: VERSION_FOLDER_PATTERN
  }));
}

function candidateHomes() {
  const homeFromEnvironment = process.env["WEBSTORM_HOME"];
  const localAppData = process.env["LOCALAPPDATA"];
  const programFiles = [process.env["ProgramFiles"], process.env["ProgramFiles(x86)"]];
  const homes: string[] = [];
  const hasHomeOverride = homeFromEnvironment !== undefined;
  if (hasHomeOverride) {
    homes.push(homeFromEnvironment);
  }

  const hasLocalAppData = localAppData !== undefined;
  if (hasLocalAppData) {
    homes.push(
      ...foldersMatching({
        parent: path.join(localAppData, "Programs"),
        pattern: WEBSTORM_FOLDER_PATTERN
      }),
      ...toolboxInstalls(localAppData)
    );
  }

  for (const folder of programFiles) {
    const hasProgramFilesFolder = folder !== undefined;
    if (hasProgramFilesFolder) {
      homes.push(
        ...foldersMatching({
          parent: path.join(folder, "JetBrains"),
          pattern: WEBSTORM_FOLDER_PATTERN
        })
      );
    }
  }

  return homes;
}

/**
 * The folder of an installed WebStorm that can run inspections headless, or
 * `undefined` when there is none. Looked for in `WEBSTORM_HOME`, the per-user
 * install, the JetBrains Toolbox and Program Files, the newest version first.
 */
export function findWebStorm() {
  return candidateHomes().find(home => existsSync(path.join(home, INSPECT_SCRIPT)));
}

/** The launcher that runs an inspection and exits, inside a WebStorm folder. */
export function inspectScriptOf(home: string) {
  return path.join(home, INSPECT_SCRIPT);
}

/**
 * The plugins folder of the user's own WebStorm (the newest config folder
 * that has one), or `undefined`: where the plugin installer unpacks.
 */
export function findUserPluginsFolder() {
  const appData = process.env["APPDATA"];
  const hasAppData = appData !== undefined;
  if (!hasAppData) {
    return undefined;
  }

  return foldersMatching({
    parent: path.join(appData, "JetBrains"),
    pattern: WEBSTORM_FOLDER_PATTERN
  })
    .map(folder => path.join(folder, "plugins"))
    .find(plugins => existsSync(plugins));
}

function findInstalledSveltePlugin() {
  const appData = process.env["APPDATA"];
  const hasAppData = appData !== undefined;
  if (!hasAppData) {
    return undefined;
  }

  const configFolders = foldersMatching({
    parent: path.join(appData, "JetBrains"),
    pattern: WEBSTORM_FOLDER_PATTERN
  });
  return configFolders
    .map(folder => path.join(folder, "plugins", SVELTE_PLUGIN_FOLDER))
    .find(plugin => existsSync(plugin));
}

async function downloadedSveltePlugin(ideHome: string) {
  const build = readFileSync(path.join(ideHome, "build.txt"), "utf8").trim();
  const folder = path.join(SVELTE_CACHE, build);
  const plugin = path.join(folder, SVELTE_PLUGIN_FOLDER);
  if (existsSync(plugin)) {
    return plugin;
  }

  const query = new URLSearchParams({
    action: "download",
    id: SVELTE_PLUGIN_ID,
    build
  });
  const response = await fetch(`${MARKETPLACE_DOWNLOAD}?${query}`);
  if (!response.ok) {
    return undefined;
  }

  mkdirSync(folder, { recursive: true });
  const archive = path.join(folder, "svelte.zip");
  writeFileSync(archive, Buffer.from(await response.arrayBuffer()));
  const unpacked = spawnSync(WINDOWS_TAR, ["-xf", archive, "-C", folder]);
  const isUnpacked = unpacked.status === 0 && existsSync(plugin);
  return isUnpacked ? plugin : undefined;
}

/**
 * The Svelte plugin build that fits the WebStorm at `ideHome`: the one the
 * JetBrains Marketplace serves for that IDE's build, cached under
 * `.verify/svelte-plugin`, so a WebStorm whose own Svelte plugin has not
 * caught up with an update still gets checked. Offline, the copy the user's own
 * WebStorm installed (the newest config folder that has one) stands in, or
 * `undefined` when there is none; the check copies it into its isolated
 * config and never reads or writes anything else of the user's.
 */
export async function sveltePluginFor(ideHome: string) {
  try {
    return await downloadedSveltePlugin(ideHome) ?? findInstalledSveltePlugin();
  } catch {
    return findInstalledSveltePlugin();
  }
}
