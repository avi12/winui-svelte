// Builds the WebStorm plugin (ide/webstorm), installs it into the isolated
// WebStorm that check-webstorm.ts uses (nothing of the developer's IDE is
// touched) and runs its inspection over two fixture projects: one that depends
// on winui-svelte, where each line marked `<!-- convert -->` must report and
// no other line may, and one that does not, which must report nothing.
//
//   node scripts/editor/check-webstorm-plugin.ts [--require] [--skip-build] [--verify]
//
// The build runs the plugin's tests (the Kotlin lint is `pnpm lint:kotlin`); --verify
// only runs JetBrains' Plugin Verifier over the built plugin against the installed
// WebStorm (API removed or changed, and the experimental and deprecated API it
// still uses), which is how a plugin learns it will break before an IDE update does.
//
// The quick fix itself is proved by the plugin's own tests (`gradlew test`,
// which the build runs): the command-line inspection has no way to apply it.
import {
  installPlugin,
  prepareIsolation,
  RESULTS_FOLDER,
  runInspection
} from "#scripts/editor/webstorm/isolated-ide.ts";
import { findWebStorm, sveltePluginFor } from "#scripts/editor/webstorm/locate.ts";
import {
  buildPlugin,
  builtZip,
  PLUGIN_FOLDER_NAME,
  PLUGIN_ROOT,
  runGradle
} from "#scripts/editor/webstorm/plugin-build.ts";
import { readProblems } from "#scripts/editor/webstorm/problems.ts";
import { cpSync, readFileSync, rmSync } from "node:fs";
import path from "node:path";
import { parseArgs } from "node:util";

const REPO_ROOT = path.resolve(import.meta.dirname, "../..");
const FIXTURES = path.join(PLUGIN_ROOT, "fixtures");
const WORKING_FOLDER = path.join(REPO_ROOT, ".verify", "webstorm", "plugin-fixtures");
const PROFILE_PATH = path.join(import.meta.dirname, "webstorm", "plugin-profile.xml");
const INSPECTION = "WinuiPropCssCounterpart";
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

function singleRunTasks(values: {
  verify: boolean;
}) {
  return values.verify ? ["buildPlugin", "verifyPlugin"] : undefined;
}

async function inspectFixtures({ ideHome, sveltePlugin, zipPath }: {
  ideHome: string;
  sveltePlugin: string;
  zipPath: string;
}) {
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
      verify: {
        type: "boolean",
        default: false
      }
    }
  });
  const isRequired = values.require;
  const ideHome = findWebStorm();
  const sveltePlugin = ideHome === undefined ? undefined : await sveltePluginFor(ideHome);
  const isInstalled = ideHome !== undefined && sveltePlugin !== undefined;
  if (!isInstalled) {
    skip({
      reason: "WebStorm or its Svelte plugin is not installed; the check runs where they are.",
      isRequired
    });
    return;
  }

  const singleRun = singleRunTasks(values);
  const isSingleRun = singleRun !== undefined;
  if (isSingleRun) {
    const isDone = runGradle({
      ideHome,
      tasks: singleRun
    });
    process.exitCode = isDone ? 0 : 1;
    return;
  }

  const isBuilt = values["skip-build"] || buildPlugin({
    paths: {
      ideHome
    },
    tasks: ["test", "buildPlugin"]
  });
  const zipPath = builtZip();
  const isReady = isBuilt && zipPath !== undefined;
  if (!isReady) {
    console.error("WebStorm plugin check FAILED: the plugin did not build or its tests failed.");
    process.exitCode = 1;
    return;
  }

  await inspectFixtures({
    ideHome,
    sveltePlugin,
    zipPath
  });
}

await main();
