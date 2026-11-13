import { pnpmInvocation } from "#scripts/package-manager.ts";
import { spawn } from "node:child_process";
import path from "node:path";

// `pnpm lint`: every check, whether or not another failed, so a single run
// lists everything to fix. Exits 1 if any step failed. Steps run side by side
// (at most MAX_PARALLEL at once), each after the steps it needs; a step's
// output is printed whole when it ends, so the lines of two never interleave.
// `pnpm lint:summary` counts what they report per rule and folder.

const PACKAGE_ROOT = path.join(import.meta.dirname, "..", "..");
const MAX_PARALLEL = 4;
const BUILD = "build";
const IS_FULL = process.argv.includes("--full");

interface StepResult {
  isOk: boolean;
  output: string;
}

interface Step {
  name: string;
  needs: string[];
  isAlone?: true;
  isHeavy?: true;
  isFullOnly?: true;
}

// `isAlone`: WebStorm resolves types under a timeout, so a loaded machine makes
// it underline code that is fine; it runs last, with nothing beside it.
// `isHeavy`: a step that holds gigabytes (a TypeScript program, many checker
// processes); at most one runs at a time, so the peak is the largest of them,
// not their sum.
// `isFullOnly`: the IDE inspections (WebStorm about 5 GB) and the packed-
// tarball check (about 3.7 GB, 8 minutes) hold the most memory, so only
// `pnpm lint:full`, which CI and a release run, includes them.
// Longest first, so the slow ones start while the short ones fill the gaps.
// Those that import `winui-svelte` read dist/, so they wait for the build.
const ALL_STEPS: Step[] = [
  {
    name: "check:webstorm",
    needs: [BUILD],
    isAlone: true,
    isFullOnly: true
  },
  {
    name: "check:webstorm-plugin",
    needs: [],
    isAlone: true,
    isFullOnly: true
  },
  {
    name: BUILD,
    needs: []
  },
  {
    name: "lint:eslint",
    needs: [BUILD]
  },
  {
    name: "check",
    needs: [BUILD],
    isHeavy: true
  },
  {
    name: "check:editor",
    needs: [BUILD],
    isHeavy: true,
    isFullOnly: true
  },
  {
    name: "check:package",
    needs: [BUILD],
    isHeavy: true,
    isFullOnly: true
  },
  {
    name: "lint:oxlint",
    needs: [BUILD]
  },
  {
    name: "lint:stylelint",
    needs: [BUILD]
  },
  {
    name: "fallow",
    needs: []
  },
  {
    name: "gen:components:check",
    needs: []
  },
  {
    name: "gen:css-data:check",
    needs: []
  },
  {
    name: "gen:accessibility-rules:check",
    needs: []
  },
  {
    name: "gen:ide-data:check",
    needs: []
  }
];

const STEPS = ALL_STEPS.filter(({ isFullOnly }) => IS_FULL || isFullOnly !== true);

function runStep(name: string) {
  const invocation = pnpmInvocation(["run", name]);
  const child = invocation
    ? spawn(invocation.command, invocation.args, { cwd: PACKAGE_ROOT })
    : spawn("pnpm", ["run", name], {
      cwd: PACKAGE_ROOT,
      shell: true
    });
  return new Promise<StepResult>(resolve => {
    const chunks: Buffer[] = [];
    child.stdout.on("data", (chunk: Buffer) => chunks.push(chunk));
    child.stderr.on("data", (chunk: Buffer) => chunks.push(chunk));
    child.on("close", code => {
      resolve({
        isOk: code === 0,
        output: Buffer.concat(chunks).toString("utf8")
      });
    });
  });
}

async function main() {
  const failed: string[] = [];
  const finished = new Set<string>();
  const started = new Set<string>();
  let running = 0;
  let heavyRunning = 0;
  await new Promise<void>(done => {
    function schedule() {
      const isAllStarted = started.size === STEPS.length;
      const isFinished = isAllStarted && running === 0;
      if (isFinished) {
        done();
        return;
      }

      for (const step of STEPS) {
        const isWaiting = step.needs.some(need => !finished.has(need));
        const isWaitingForTheRest = step.isAlone === true
          && (running > 0 || STEPS.some(other => other.isAlone !== true && !finished.has(other.name)));
        const isWaitingForHeavy = step.isHeavy === true && heavyRunning > 0;
        const isStartable = !started.has(step.name) && !isWaiting && !isWaitingForTheRest
          && !isWaitingForHeavy && running < MAX_PARALLEL;
        if (isStartable) {
          void start(step);
        }
      }
    }

    async function start({ name, isHeavy }: Step) {
      started.add(name);
      running += 1;
      heavyRunning += isHeavy === true ? 1 : 0;
      console.log(`==> pnpm ${name}`);
      const { isOk, output } = await runStep(name);
      process.stdout.write(`\n==> pnpm ${name}: ${isOk ? "passed" : "FAILED"}\n${output}`);

      if (!isOk) {
        failed.push(name);
      }

      finished.add(name);
      running -= 1;
      heavyRunning -= isHeavy === true ? 1 : 0;
      schedule();
    }

    schedule();
  });

  const isPassing = failed.length === 0;
  console.log(isPassing ? "\nlint: every step passed" : `\nlint: failed steps: ${failed.join(", ")}`);
  process.exitCode = isPassing ? 0 : 1;
}

await main();
