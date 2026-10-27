import { spawnSync } from "node:child_process";
import path from "node:path";

// `pnpm lint`: every check, one after another, whether or not an earlier one
// failed, so a single run lists everything to fix. Exits 1 if any step failed.
// `pnpm lint:summary` counts what they report per rule and folder.

const packageRoot = path.join(import.meta.dirname, "..", "..");
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
  const options = { cwd: packageRoot, stdio: "inherit" } as const;
  const result = pnpmScript === undefined
    ? spawnSync("pnpm", ["run", name], { ...options, shell: true })
    : spawnSync(process.execPath, [pnpmScript, "run", name], options);
  return result.status === 0;
}

function main() {
  const failed: string[] = [];
  for (const step of STEPS) {
    console.log(`\n==> pnpm ${step}`);
    if (runStep(step) === false) {
      failed.push(step);
    }
  }

  console.log(failed.length === 0 ? "\nlint: every step passed" : `\nlint: failed steps: ${failed.join(", ")}`);
  process.exitCode = failed.length === 0 ? 0 : 1;
}

main();
