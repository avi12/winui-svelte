// Builds the WebStorm plugin (ide/webstorm), installs it into the isolated
// WebStorm that check-webstorm.ts uses (nothing of the developer's IDE is
// touched) and runs its inspection over two fixture projects: one that depends
// on winui-svelte, where each line marked `<!-- convert -->` must report and
// no other line may, and one that does not, which must report nothing.
//
//   node scripts/editor/check-webstorm-plugin.ts [--require] [--skip-build] [--fix-kotlin]
//
// The build runs the plugin's tests and its Kotlin lint (ktlint and detekt);
// --fix-kotlin only runs the ktlint formatter, as `pnpm lint:fix` does.
//
// The quick fix itself is proved by the plugin's own tests (`gradlew test`,
// which the build runs): the command-line inspection has no way to apply it.
import {
  installPlugin,
  prepareIsolation,
  RESULTS_FOLDER,
  runInspection
} from "#scripts/editor/webstorm/isolated-ide.ts";
import { findSveltePlugin, findWebStorm } from "#scripts/editor/webstorm/locate.ts";
import { readProblems } from "#scripts/editor/webstorm/problems.ts";
import { spawnSync } from "node:child_process";
import {
  cpSync,
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  rmSync
} from "node:fs";
import path from "node:path";
import { parseArgs } from "node:util";

const REPO_ROOT = path.resolve(import.meta.dirname, "../..");
const PLUGIN_ROOT = path.join(REPO_ROOT, "ide", "webstorm");
const FIXTURES = path.join(PLUGIN_ROOT, "fixtures");
const WORKING_FOLDER = path.join(REPO_ROOT, ".verify", "webstorm", "plugin-fixtures");
const GRADLE_HOME = path.join(REPO_ROOT, ".verify", "gradle-home");
const PROFILE_PATH = path.join(import.meta.dirname, "webstorm", "plugin-profile.xml");
const INSPECTION = "WinuiPropCssCounterpart";
const PLUGIN_FOLDER_NAME = "winui-svelte-webstorm";
const MARKER = "<!-- convert -->";
const WITH_DEPENDENCY = "with-dependency";
const WITHOUT_DEPENDENCY = "without-dependency";
const FIXTURE_FILE = "App.svelte";

function skip({ reason, isRequired }: {
  reason: string;
  isRequired: boolean;
}) {
  console.log(`WebStorm plugin check ${isRequired ? "FAILED (--require)" : "skipped"}: ${reason}`);
  process.exitCode = isRequired ? 1 : 0;
}

function runGradle({ ideHome, sveltePlugin, tasks }: {
  ideHome: string;
  sveltePlugin: string;
  tasks: string[];
}) {
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

function buildPlugin(paths: {
  ideHome: string;
  sveltePlugin: string;
}) {
  rmSync(path.join(PLUGIN_ROOT, "build", "distributions"), {
    recursive: true,
    force: true
  });
  return runGradle({
    ...paths,
    tasks: ["test", "buildPlugin", "ktLint"]
  });
}

function builtZip() {
  const distributions = path.join(PLUGIN_ROOT, "build", "distributions");
  const zip = existsSync(distributions) ? readdirSync(distributions).find(name => name.endsWith(".zip")) : undefined;
  return zip === undefined ? undefined : path.join(distributions, zip);
}

function markedLines(fixture: string) {
  return readFileSync(path.join(FIXTURES, fixture, FIXTURE_FILE), "utf8")
    .split(/\r?\n/u)
    .flatMap((text, i) => text.includes(MARKER) ? [i + 1] : []);
}

async function reportedLines({ ideHome, sveltePlugin, zipPath, fixture }: {
  ideHome: string;
  sveltePlugin: string;
  zipPath: string;
  fixture: string;
}) {
  prepareIsolation({ sveltePlugin });
  installPlugin({
    zipPath,
    folderName: PLUGIN_FOLDER_NAME
  });
  const project = path.join(WORKING_FOLDER, fixture);
  rmSync(project, {
    recursive: true,
    force: true
  });
  cpSync(path.join(FIXTURES, fixture), project, { recursive: true });
  const exitCode = await runInspection({
    ideHome,
    projectFolder: project,
    profilePath: PROFILE_PATH
  });
  const isFinished = exitCode === 0;
  if (!isFinished) {
    throw new Error(`the inspection of ${fixture} did not finish (exit ${exitCode ?? "killed after the timeout"})`);
  }

  const problems = readProblems({
    resultsFolder: RESULTS_FOLDER,
    inspections: [INSPECTION]
  });
  // A line is reported once per view of the file the IDE inspects; it counts once.
  return [...new Set(problems.map(problem => problem.line))];
}

function sameLines({ expected, actual }: {
  expected: number[];
  actual: number[];
}) {
  return JSON.stringify(expected) === JSON.stringify(actual);
}

async function main() {
  const { values } = parseArgs({
    options: {
      require: {
        type: "boolean",
        default: false
      },
      "skip-build": {
        type: "boolean",
        default: false
      },
      "fix-kotlin": {
        type: "boolean",
        default: false
      }
    }
  });
  const isRequired = values.require;
  const ideHome = findWebStorm();
  const sveltePlugin = findSveltePlugin();
  const isInstalled = ideHome !== undefined && sveltePlugin !== undefined;
  if (!isInstalled) {
    skip({
      reason: "WebStorm or its Svelte plugin is not installed; the check runs where they are.",
      isRequired
    });
    return;
  }

  if (values["fix-kotlin"]) {
    const isFixed = runGradle({
      ideHome,
      sveltePlugin,
      tasks: ["ktLintFix"]
    });
    process.exitCode = isFixed ? 0 : 1;
    return;
  }

  const isBuilt = values["skip-build"] || buildPlugin({
    ideHome,
    sveltePlugin
  });
  const zipPath = builtZip();
  const isReady = isBuilt && zipPath !== undefined;
  if (!isReady) {
    console.error("WebStorm plugin check FAILED: the plugin did not build or its tests failed.");
    process.exitCode = 1;
    return;
  }

  const cases = [
    {
      fixture: WITH_DEPENDENCY,
      expected: markedLines(WITH_DEPENDENCY)
    },
    {
      fixture: WITHOUT_DEPENDENCY,
      expected: []
    }
  ];
  for (const { fixture, expected } of cases) {
    const actual = await reportedLines({
      ideHome,
      sveltePlugin,
      zipPath,
      fixture
    });
    const isMatching = sameLines({
      expected,
      actual
    });
    console.log(`${isMatching ? "ok" : "FAILED"} ${fixture}: expected lines [${expected}], reported [${actual}]`);

    if (!isMatching) {
      process.exitCode = 1;
    }
  }
}

await main();
