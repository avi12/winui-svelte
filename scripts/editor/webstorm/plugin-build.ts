// Builds the WebStorm plugin (ide/webstorm) against the WebStorm and the Svelte
// plugin found on this machine; shared by the check and the installer.
import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readdirSync, rmSync } from "node:fs";
import path from "node:path";

const REPO_ROOT = path.resolve(import.meta.dirname, "../../..");

/** The Gradle project of the plugin. */
export const PLUGIN_ROOT = path.join(REPO_ROOT, "ide", "webstorm");

/** The folder the built plugin is unpacked into, in a plugins folder. */
export const PLUGIN_FOLDER_NAME = "winui-svelte-webstorm";

const GRADLE_HOME = path.join(REPO_ROOT, ".verify", "gradle-home");
const DISTRIBUTIONS = path.join(PLUGIN_ROOT, "build", "distributions");

/** The paths a plugin build needs: the IDE it compiles against and the Svelte plugin it depends on. */
export interface PluginBuildPaths {
  ideHome: string;
  sveltePlugin: string;
}

/** Runs Gradle tasks of the plugin with its caches inside the repository; true when they succeeded. */
export function runGradle({ ideHome, sveltePlugin, tasks }: PluginBuildPaths & { tasks: string[] }) {
  mkdirSync(GRADLE_HOME, { recursive: true });
  const wrapper = path.join(PLUGIN_ROOT, "gradlew.bat");
  const built = spawnSync(
    "cmd.exe",
    [
      "/d",
      "/c",
      wrapper,
      ...tasks,
      "--console=plain",
      `-PwebstormHome=${ideHome}`,
      `-PsvelteHome=${sveltePlugin}`
    ],
    {
      cwd: PLUGIN_ROOT,
      env: {
        ...process.env,
        GRADLE_USER_HOME: GRADLE_HOME
      },
      encoding: "utf8",
      maxBuffer: Number.MAX_SAFE_INTEGER,
      windowsHide: true
    }
  );
  const isBuilt = built.status === 0;
  if (!isBuilt) {
    console.error(built.stdout, built.stderr);
  }

  return isBuilt;
}

/** Builds the plugin's zip from a clean distributions folder; true when the tasks succeeded. */
export function buildPlugin({ paths, tasks }: {
  paths: PluginBuildPaths;
  tasks: string[];
}) {
  rmSync(DISTRIBUTIONS, {
    recursive: true,
    force: true
  });
  return runGradle({
    ...paths,
    tasks
  });
}

/** The zip a build wrote, or undefined when there is none. */
export function builtZip() {
  const zip = existsSync(DISTRIBUTIONS) ? readdirSync(DISTRIBUTIONS).find(name => name.endsWith(".zip")) : undefined;
  return zip === undefined ? undefined : path.join(DISTRIBUTIONS, zip);
}
