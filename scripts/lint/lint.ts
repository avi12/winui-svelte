import { spawnSync } from "node:child_process";
import path from "node:path";

// `pnpm lint`: every check, one after another, whether or not an earlier one
// failed, so a single run lists everything to fix. Exits 1 if any step failed.
// `pnpm lint:summary` counts what they report per rule and folder.

const PACKAGE_ROOT = path.join(import.meta.dirname, "..", "..");
const STEPS = [
  "build",
  "lint:oxlint",
  "lint:eslint",
  "lint:stylelint",
  "check",
  "check:editor",
  "fallow",
  "gen:components:check",
  "check:package"
];

function runStep(name: string) {
  const pnpmScript = process.env["npm_execpath"];
  const isRunThroughPnpm = pnpmScript !== undefined;
  const result = isRunThroughPnpm
    ? spawnSync(process.execPath, [pnpmScript, "run", name], {
      cwd: PACKAGE_ROOT,
      stdio: "inherit"
    })
    : spawnSync("pnpm", ["run", name], {
      cwd: PACKAGE_ROOT,
      stdio: "inherit",
      shell: true
    });
  return result.status === 0;
}

function main() {
  const failed: string[] = [];
  for (const step of STEPS) {
    console.log(`\n==> pnpm ${step}`);

    if (!runStep(step)) {
      failed.push(step);
    }
  }

  const isPassing = failed.length === 0;
  console.log(isPassing ? "\nlint: every step passed" : `\nlint: failed steps: ${failed.join(", ")}`);
  process.exitCode = isPassing ? 0 : 1;
}

main();
