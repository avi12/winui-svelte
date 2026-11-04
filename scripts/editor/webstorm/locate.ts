// Finds what the WebStorm check needs on this machine, without a hardcoded
// path: the IDE itself and the Svelte plugin, which WebStorm does not bundle
// (it is installed from the JetBrains marketplace into the user's config).
import { existsSync, readdirSync } from "node:fs";
import path from "node:path";

const INSPECT_SCRIPT = path.join("bin", "inspect.bat");
const WEBSTORM_FOLDER_PATTERN = /^WebStorm/i;
const TOOLBOX_CHANNEL_PATTERN = /^ch-/;
const VERSION_FOLDER_PATTERN = /^\d/;
const SVELTE_PLUGIN_FOLDER = "svelte";

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

/**
 * The Svelte plugin as the user's own WebStorm installed it (the newest
 * config folder that has one), or `undefined`. The check copies it into its
 * isolated config; it never reads or writes anything else of the user's.
 */
export function findSveltePlugin() {
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
