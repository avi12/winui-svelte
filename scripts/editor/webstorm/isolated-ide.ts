// Runs WebStorm's inspections in an instance of its own, so the check never
// touches the IDE the developer has open:
//
// - its config, system, plugin and log folders are all under .verify/webstorm
//   (never %APPDATA%\JetBrains or %LOCALAPPDATA%\JetBrains), so it shares no
//   lock or port with a running WebStorm and a command cannot be handed to it;
// - it inspects a shadow copy of the working tree, so the project's own .idea
//   is never written: the copy carries the one setting the check needs, which
//   turns the TypeScript language service off so the IDE's own type
//   evaluator runs (inspections do not run the service's annotator);
// - the process is started here and only ever stopped by its pid.
import { inspectScriptOf } from "#scripts/editor/webstorm/locate.ts";
import { spawn, spawnSync } from "node:child_process";
import {
  copyFileSync,
  cpSync,
  existsSync,
  lstatSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  realpathSync,
  rmSync,
  statSync,
  symlinkSync,
  unlinkSync,
  utimesSync,
  writeFileSync
} from "node:fs";
import path from "node:path";
import { z } from "zod";

const REPO_ROOT = path.resolve(import.meta.dirname, "../../..");
const ISOLATED_FOLDER = path.join(REPO_ROOT, ".verify", "webstorm");
const CONFIG_FOLDER = path.join(ISOLATED_FOLDER, "config");
const SYSTEM_FOLDER = path.join(ISOLATED_FOLDER, "system");
const PLUGINS_FOLDER = path.join(ISOLATED_FOLDER, "plugins");
const LOG_FOLDER = path.join(ISOLATED_FOLDER, "log");
const SHADOW_FOLDER = path.join(ISOLATED_FOLDER, "project");
/** The folder the inspection writes one JSON file per inspection into. */
export const RESULTS_FOLDER = path.join(ISOLATED_FOLDER, "results");
const VM_OPTIONS_FILE = path.join(ISOLATED_FOLDER, "vmoptions.txt");
const SVELTE_PLUGIN_FOLDER = "svelte";
// The WebStorm plugin has a build and fixtures of its own, checked by check-webstorm-plugin.ts.
const PLUGIN_FOLDER = "ide/";
// The tar that ships with Windows reads a zip and a drive letter; a Git Bash tar earlier on PATH reads neither.
const WINDOWS_TAR = path.join(process.env["SystemRoot"] ?? "C:Windows", "System32", "tar.exe");
const DEPENDENCIES_FOLDER = "node_modules";
const KEPT_IN_SHADOW = [".idea", DEPENDENCIES_FOLDER];
// The generated WinUI bindings are reached through #winui/*, which package.json
// maps to dist/bindings, a folder git ignores and so the copy lacks. Linked or
// copied in whole at that path they would be inspected too (some three thousand
// findings in code that is not ours), and the IDE evaluates their types
// unreliably as project code. So the shadow holds a real copy of their
// declarations only, 1 MB of the 100, in node_modules as the dependency they
// are, and its package.json maps #winui/* there.
const BUILT_BINDINGS = path.join("dist", "bindings");
const SHADOW_BINDINGS = path.join(DEPENDENCIES_FOLDER, "winui-bindings");
const IMPORTS_KEY = "#winui/*";
const DECLARATION_SUFFIX = ".d.ts";
const PACKAGE_MANIFEST = "package.json";
const IDEA_FOLDER = ".idea";
const COMPILER_SETTINGS_FILE = "compiler.xml";
const MILLISECONDS_PER_MINUTE = 60_000;
const INSPECTION_TIMEOUT_MINUTES = 10;
const NUL_SEPARATOR = "\0";
const WINDOWS_QUOTE = "\"";

// The TypeScript language service off: with it on, the IDE's own type checks
// defer to the service, which a headless inspection never starts.
const COMPILER_SETTINGS = `<?xml version="1.0" encoding="UTF-8"?>
<project version="4">
  <component name="TypeScriptCompiler">
    <option name="useService" value="false" />
  </component>
</project>
`;

function vmOptions() {
  return [
    `-Didea.config.path=${CONFIG_FOLDER}`,
    `-Didea.system.path=${SYSTEM_FOLDER}`,
    `-Didea.plugins.path=${PLUGINS_FOLDER}`,
    `-Didea.log.path=${LOG_FOLDER}`,
    "-Djb.consents.confirmation.enabled=false",
    "-Dide.show.tips.on.startup.default.value=false",
    "-Didea.trust.all.projects=true"
  ].join("\n");
}

/**
 * Creates the isolated folders and the VM options that point the IDE at them,
 * and puts the Svelte plugin in the isolated plugin folder, replacing the copy of an
 * earlier run, which may belong to another IDE build.
 */
export function prepareIsolation({ sveltePlugin }: {
  sveltePlugin: string;
}) {
  // Every run starts from empty caches and an empty log. Warm caches are
  // faster by a dozen seconds but unsafe: the first run after a file changed
  // inspected the file as it was, and with the language service off the IDE
  // lost its dependency libraries on every other run.
  for (const folder of [SYSTEM_FOLDER, LOG_FOLDER]) {
    rmSync(folder, {
      recursive: true,
      force: true
    });
  }

  for (const folder of [CONFIG_FOLDER, SYSTEM_FOLDER, PLUGINS_FOLDER, LOG_FOLDER]) {
    mkdirSync(folder, { recursive: true });
  }

  writeFileSync(VM_OPTIONS_FILE, vmOptions());
  const installedPlugin = path.join(PLUGINS_FOLDER, SVELTE_PLUGIN_FOLDER);
  rmSync(installedPlugin, {
    recursive: true,
    force: true
  });
  cpSync(sveltePlugin, installedPlugin, { recursive: true });
}

/**
 * Unpacks a built plugin (the zip the IntelliJ Platform Gradle plugin makes)
 * into a plugins folder (the isolated one by default), replacing the folder of an earlier build.
 */
export function installPlugin({ zipPath, folderName, pluginsFolder = PLUGINS_FOLDER }: {
  zipPath: string;
  folderName: string;
  pluginsFolder?: string;
}) {
  rmSync(path.join(pluginsFolder, folderName), {
    recursive: true,
    force: true
  });
  const unpacked = spawnSync(WINDOWS_TAR, ["-xf", zipPath, "-C", pluginsFolder]);
  const isUnpacked = unpacked.status === 0;
  if (!isUnpacked) {
    throw new Error(`could not unpack ${zipPath}: ${unpacked.stderr.toString()}`);
  }
}

function sourceFiles() {
  const listed = spawnSync("git", ["ls-files", "-co", "--exclude-standard", "-z"], {
    cwd: REPO_ROOT,
    encoding: "utf8",
    maxBuffer: Number.MAX_SAFE_INTEGER
  });
  return listed.stdout
    .split(NUL_SEPARATOR)
    .filter(file => file !== "" && !file.startsWith(PLUGIN_FOLDER) && existsSync(path.join(REPO_ROOT, file)));
}

function isUpToDate({ source, target }: {
  source: string;
  target: string;
}) {
  if (!existsSync(target)) {
    return false;
  }

  const sourceStat = statSync(source);
  const targetStat = statSync(target);
  return sourceStat.size === targetStat.size && sourceStat.mtimeMs === targetStat.mtimeMs;
}

// Copied with their modification time, so the IDE's caches stay valid for the
// files that did not change between runs.
function copyKeepingTime({ source, target }: {
  source: string;
  target: string;
}) {
  mkdirSync(path.dirname(target), { recursive: true });
  copyFileSync(source, target);
  const { atime, mtime } = statSync(source);
  utimesSync(target, atime, mtime);
}

function removeStaleFiles({ folder, wanted }: {
  folder: string;
  wanted: Set<string>;
}) {
  for (const entry of readdirSync(folder, { withFileTypes: true })) {
    const entryPath = path.join(folder, entry.name);
    const isKept = folder === SHADOW_FOLDER && KEPT_IN_SHADOW.includes(entry.name);
    if (isKept) {
      continue;
    }

    // A link is never followed: its target is the repo's own folder.
    if (entry.isSymbolicLink()) {
      unlinkSync(entryPath);
    } else if (entry.isDirectory()) {
      removeStaleFiles({
        folder: entryPath,
        wanted
      });
    } else if (!wanted.has(entryPath)) {
      rmSync(entryPath);
    }
  }
}

function copyBindingDeclarations({ source, target }: {
  source: string;
  target: string;
}) {
  const files = readdirSync(source, {
    recursive: true,
    encoding: "utf8"
  })
    .filter(file => file.endsWith(DECLARATION_SUFFIX) || file === PACKAGE_MANIFEST);
  for (const file of files) {
    const from = path.join(source, file);
    const to = path.join(target, file);
    if (!isUpToDate({
      source: from,
      target: to
    })) {
      copyKeepingTime({
        source: from,
        target: to
      });
    }
  }
}

// A real folder of links to the repo's dependencies. Each is linked to its
// real folder, not to a link of it: the IDE does not follow a chain.
function linkDependencies() {
  const source = path.join(REPO_ROOT, DEPENDENCIES_FOLDER);
  const target = path.join(SHADOW_FOLDER, DEPENDENCIES_FOLDER);
  if (!existsSync(source)) {
    return;
  }

  const isOldLink = existsSync(target) && lstatSync(target).isSymbolicLink();
  if (isOldLink) {
    unlinkSync(target);
  }

  mkdirSync(target, { recursive: true });
  for (const entry of readdirSync(source, { withFileTypes: true })) {
    const link = path.join(target, entry.name);
    const isLinkable = entry.isDirectory() || entry.isSymbolicLink();
    const isLinkNeeded = isLinkable && !existsSync(link);
    if (isLinkNeeded) {
      symlinkSync(realpathSync(path.join(source, entry.name)), link, "junction");
    }
  }

  const bindings = path.join(REPO_ROOT, BUILT_BINDINGS);
  if (existsSync(bindings)) {
    copyBindingDeclarations({
      source: bindings,
      target: path.join(SHADOW_FOLDER, SHADOW_BINDINGS)
    });
  }
}

/**
 * Makes the shadow project match the working tree (tracked files plus
 * untracked ones git does not ignore, edits included) and links the folders
 * that hold dependencies, so the IDE resolves imports as it does in the repo.
 *
 * @returns the shadow project's folder, the one to inspect
 */
export function syncShadowProject({ isUsingIdeTypes }: {
  isUsingIdeTypes: boolean;
}) {
  mkdirSync(path.join(SHADOW_FOLDER, IDEA_FOLDER), { recursive: true });
  const wanted = new Set<string>();
  for (const file of sourceFiles()) {
    const source = path.join(REPO_ROOT, file);
    const target = path.join(SHADOW_FOLDER, file);
    wanted.add(target);

    if (!isUpToDate({
      source,
      target
    })) {
      copyKeepingTime({
        source,
        target
      });
    }
  }

  removeStaleFiles({
    folder: SHADOW_FOLDER,
    wanted
  });
  const compilerSettings = path.join(SHADOW_FOLDER, IDEA_FOLDER, COMPILER_SETTINGS_FILE);
  if (isUsingIdeTypes) {
    writeFileSync(compilerSettings, COMPILER_SETTINGS);
  } else {
    rmSync(compilerSettings, { force: true });
  }

  linkDependencies();
  mapBindingsIntoDependencies();
  return SHADOW_FOLDER;
}

const manifestSchema = z.looseObject({
  imports: z.record(z.string(), z.unknown())
});

function mapBindingsIntoDependencies() {
  const manifestPath = path.join(SHADOW_FOLDER, PACKAGE_MANIFEST);
  const manifest = manifestSchema.parse(JSON.parse(readFileSync(manifestPath, "utf8")));
  const mapped = {
    ...manifest,
    imports: {
      ...manifest.imports,
      [IMPORTS_KEY]: `./${SHADOW_BINDINGS.replaceAll(path.sep, "/")}/*.d.ts`
    }
  };
  writeFileSync(manifestPath, JSON.stringify(mapped, undefined, 2));
}

function quoted(value: string) {
  return `${WINDOWS_QUOTE}${value}${WINDOWS_QUOTE}`;
}

function stopTree(pid: number | undefined) {
  const hasPid = pid !== undefined;
  if (!hasPid) {
    return;
  }

  spawnSync("taskkill", ["/T", "/F", "/PID", String(pid)]);
}

/**
 * Runs the IDE's command-line inspection of `projectFolder` with the profile
 * at `profilePath`, writing JSON results into {@link RESULTS_FOLDER}. The
 * process is the one started here and is killed by its pid if it outlives the
 * timeout.
 *
 * @returns the exit code, or `undefined` when it had to be killed
 */
export async function runInspection({ ideHome, projectFolder, profilePath }: {
  ideHome: string;
  projectFolder: string;
  profilePath: string;
}) {
  rmSync(RESULTS_FOLDER, {
    recursive: true,
    force: true
  });
  mkdirSync(RESULTS_FOLDER, { recursive: true });
  const commandLine = [
    quoted(inspectScriptOf(ideHome)),
    quoted(projectFolder),
    quoted(profilePath),
    quoted(RESULTS_FOLDER),
    "-format",
    "json"
  ].join(" ");
  const child = spawn("cmd.exe", ["/d", "/s", "/c", quoted(commandLine)], {
    env: {
      ...process.env,
      WEBIDE_VM_OPTIONS: VM_OPTIONS_FILE
    },
    stdio: "ignore",
    windowsHide: true,
    windowsVerbatimArguments: true
  });
  const timeout = setTimeout(
    () => stopTree(child.pid),
    INSPECTION_TIMEOUT_MINUTES * MILLISECONDS_PER_MINUTE
  );
  const exit = await new Promise<{ code: number | null }>(resolve => {
    child.on("exit", code => {
      resolve({ code });
    });
  });
  clearTimeout(timeout);
  return exit.code ?? undefined;
}
