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

interface StepResult {
  isOk: boolean;
  output: string;
}

interface Step {
  name: string;
  needs: string[];
}

// Longest first, so the slow ones start while the short ones fill the gaps.
// Those that import `winui-svelte` read dist/, so they wait for the build.
const STEPS: Step[] = [
  {
    name: "check:webstorm",
    needs: []
  },
  {
    name: BUILD,
    needs: []
  },
  {
    name: "lint:eslint:full",
    needs: [BUILD]
  },
  {
    name: "check",
    needs: [BUILD]
  },
  {
    name: "check:editor",
    needs: [BUILD]
  },
  {
    name: "check:package",
    needs: [BUILD]
  },
  {
    name: "lint:oxlint",
    needs: [BUILD]
  },
  {
    name: "lint:stylelint",
    needs: []
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
  }
];

function runStep(name: string) {
  const pnpmScript = process.env["npm_execpath"];
  const isRunThroughPnpm = pnpmScript !== undefined;
  const child = isRunThroughPnpm
    ? spawn(process.execPath, [pnpmScript, "run", name], { cwd: PACKAGE_ROOT })
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
        const isStartable = !started.has(step.name) && !isWaiting && running < MAX_PARALLEL;
        if (isStartable) {
          void start(step.name);
        }
      }
    }

    async function start(name: string) {
      started.add(name);
      running += 1;
      console.log(`==> pnpm ${name}`);
      const { isOk, output } = await runStep(name);
      process.stdout.write(`\n==> pnpm ${name}: ${isOk ? "passed" : "FAILED"}\n${output}`);

      if (!isOk) {
        failed.push(name);
      }

      finished.add(name);
      running -= 1;
      schedule();
    }

    schedule();
  });

  const isPassing = failed.length === 0;
  console.log(isPassing ? "\nlint: every step passed" : `\nlint: failed steps: ${failed.join(", ")}`);
  process.exitCode = isPassing ? 0 : 1;
}

await main();
