// Fails when WebStorm would underline anything: the working tree is inspected
// by WebStorm's own command-line runner, in an instance of its own that never
// touches the IDE the developer has open (see webstorm/isolated-ide.ts), with
// the checks in webstorm/profile.xml. The counterpart of check-editor.ts, which
// asks the Svelte language server VS Code runs.
//
//   node scripts/editor/check-webstorm.ts [--require]
//
// Mandatory wherever WebStorm is installed. Where it is not (a CI runner, a
// VS Code-only machine) the check says so and passes, because there is nothing
// to ask; `--require` turns that into a failure for a machine that must have it.
import {
  prepareIsolation,
  RESULTS_FOLDER,
  runInspection,
  syncShadowProject
} from "#scripts/editor/webstorm/isolated-ide.ts";
import { findSveltePlugin, findWebStorm } from "#scripts/editor/webstorm/locate.ts";
import { enabledInspections, readProblems } from "#scripts/editor/webstorm/problems.ts";
import { readFileSync } from "node:fs";
import path from "node:path";
import { parseArgs } from "node:util";

const PROFILE_PATH = path.join(import.meta.dirname, "webstorm", "profile.xml");
const MILLISECONDS_PER_SECOND = 1000;
// The IDE sometimes fails to resolve the ambient rune declarations ($props and
// the like) on a run, a few problems that the next run does not report, and
// nothing in the tree changed. A real finding is reported by every run, so the
// check passes only when one of these runs is clean, and prints the last one.
const MAX_ATTEMPTS = 3;
const ATTEMPTS = Array.from({ length: MAX_ATTEMPTS }, (_unused, iAttempt) => iAttempt + 1);

function skip({ reason, isRequired }: {
  reason: string;
  isRequired: boolean;
}) {
  const verdict = isRequired ? "FAILED (--require)" : "skipped";
  console.log(`WebStorm check ${verdict}: ${reason}`);
  process.exitCode = isRequired ? 1 : 0;
}

async function inspectOnce({ ideHome, sveltePlugin, isUsingIdeTypes }: {
  ideHome: string;
  sveltePlugin: string;
  isUsingIdeTypes: boolean;
}) {
  prepareIsolation({ sveltePlugin });
  const exitCode = await runInspection({
    ideHome,
    projectFolder: syncShadowProject({ isUsingIdeTypes }),
    profilePath: PROFILE_PATH
  });
  const isFinished = exitCode === 0;
  if (!isFinished) {
    console.error(`WebStorm check FAILED: the inspection did not finish (exit ${exitCode ?? "killed after the timeout"}); see .verify/webstorm/log/idea.log.`);
    return undefined;
  }

  return readProblems({
    resultsFolder: RESULTS_FOLDER,
    inspections: enabledInspections(readFileSync(PROFILE_PATH, "utf8"))
  });
}

async function main() {
  const { values } = parseArgs({
    options: {
      require: {
        type: "boolean",
        default: false
      },
      "ide-types": {
        type: "boolean",
        default: false
      }
    }
  });
  const isRequired = values.require;
  const ideHome = findWebStorm();
  const hasWebStorm = ideHome !== undefined;
  if (!hasWebStorm) {
    skip({
      reason: "no WebStorm found (set WEBSTORM_HOME, or install it); the check runs where WebStorm is installed.",
      isRequired
    });
    return;
  }

  const sveltePlugin = findSveltePlugin();
  const hasSveltePlugin = sveltePlugin !== undefined;
  if (!hasSveltePlugin) {
    skip({
      reason: "the Svelte plugin is not installed in any WebStorm config; install it from the JetBrains marketplace.",
      isRequired
    });
    return;
  }

  const startedAt = Date.now();
  let problems: ReturnType<typeof readProblems> = [];
  for (const attempt of ATTEMPTS) {
    const found = await inspectOnce({
      ideHome,
      sveltePlugin,
      isUsingIdeTypes: values["ide-types"]
    });
    const isFinished = found !== undefined;
    if (!isFinished) {
      process.exitCode = 1;
      return;
    }

    problems = found;
    const isClean = problems.length === 0;
    if (isClean) {
      break;
    }

    console.error(`WebStorm check: attempt ${attempt} of ${ATTEMPTS.length} reported ${problems.length} problems`);
  }

  for (const problem of problems) {
    console.error(`${problem.file}:${problem.line}:${problem.column} ${problem.message} (${problem.severity} ${problem.inspection})`);
  }

  const seconds = Math.round((Date.now() - startedAt) / MILLISECONDS_PER_SECOND);
  console.log(`WebStorm check: ${problems.length} problems (${seconds}s).`);
  process.exitCode = problems.length === 0 ? 0 : 1;
}

await main();
