import { pnpmInvocation } from "#scripts/package-manager.ts";
import { spawn } from "node:child_process";
import { availableParallelism, freemem } from "node:os";
import path from "node:path";

// `pnpm lint`: every check, whether or not another failed, so a single run
// lists everything to fix. Exits 1 if any step failed. As many steps run side
// by side as the free memory and the processors allow, each after the steps it
// needs; a step's output is printed whole when it ends, with the time it took,
// so the lines of two never interleave.
// `pnpm lint:summary` counts what they report per rule and folder.

const PACKAGE_ROOT = path.join(import.meta.dirname, "..", "..");
const BYTES_PER_GIGABYTE = 1024 ** 3;
// The share of the free memory the steps may take together; the rest is left to the machine.
const MEMORY_SHARE = 0.8;
const MEMORY_BUDGET = freemem() / BYTES_PER_GIGABYTE * MEMORY_SHARE;
const LIGHT_GIGABYTES = 0.5;
const MILLISECONDS_PER_SECOND = 1000;
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

  /** The memory the step holds at its peak; a light step's when left out. */
  gigabytes?: number;
  isFullOnly?: true;
}

// `isAlone`: WebStorm resolves types under a timeout, so a loaded machine makes
// it underline code that is fine; it runs last, with nothing beside it.
// `gigabytes`: what a TypeScript program or many checker processes hold; the
// steps running at once stay within the budget, and a step larger than the
// whole budget runs alone.
// `isFullOnly`: the IDE inspections (WebStorm about 5 GB) and the packed-
// tarball check (about 3.7 GB, 8 minutes) hold the most memory, so only
// `pnpm lint:full`, which CI and a release run, includes them.
// Longest first, so the slow ones start while the short ones fill the gaps.
// Those that read dist/ (an import of `winui-svelte`, a `#winui/*` binding, a
// generator's types) wait for the build: a fresh checkout has none.
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
    name: "check:svelte",
    needs: [BUILD],
    gigabytes: 3
  },
  {
    name: "check:types",
    needs: [BUILD],
    gigabytes: 2
  },
  {
    name: "check:editor",
    needs: [BUILD],
    gigabytes: 3,
    isFullOnly: true
  },
  {
    name: "check:package",
    needs: [BUILD],
    gigabytes: 4,
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
    name: "lint:kotlin",
    needs: [],
    gigabytes: 2
  },
  {
    name: "fallow",
    needs: [BUILD]
  },
  {
    name: "gen:components:check",
    needs: [BUILD]
  },
  {
    name: "gen:css-data:check",
    needs: [BUILD]
  },
  {
    name: "gen:accessibility-rules:check",
    needs: [BUILD]
  },
  {
    name: "gen:ide-data:check",
    needs: [BUILD]
  }
];

const STEPS = ALL_STEPS.filter(({ isFullOnly }) => IS_FULL || isFullOnly !== true);

function gigabytesOf({ gigabytes = LIGHT_GIGABYTES }: Step) {
  return gigabytes;
}

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
  let heldGigabytes = 0;
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
        const isWaitingForMemory = running > 0 && heldGigabytes + gigabytesOf(step) > MEMORY_BUDGET;
        const isStartable = !started.has(step.name) && !isWaiting && !isWaitingForTheRest
          && !isWaitingForMemory && running < availableParallelism();
        if (isStartable) {
          void start(step);
        }
      }
    }

    async function start(step: Step) {
      const { name } = step;
      started.add(name);
      running += 1;
      heldGigabytes += gigabytesOf(step);
      console.log(`==> pnpm ${name}`);
      const startedAt = performance.now();
      const { isOk, output } = await runStep(name);
      const seconds = Math.round((performance.now() - startedAt) / MILLISECONDS_PER_SECOND);
      process.stdout.write(`\n==> pnpm ${name}: ${isOk ? "passed" : "FAILED"} in ${seconds} s\n${output}`);

      if (!isOk) {
        failed.push(name);
      }

      finished.add(name);
      running -= 1;
      heldGigabytes -= gigabytesOf(step);
      schedule();
    }

    schedule();
  });

  const isPassing = failed.length === 0;
  console.log(isPassing ? "\nlint: every step passed" : `\nlint: failed steps: ${failed.join(", ")}`);
  process.exitCode = isPassing ? 0 : 1;
}

await main();
