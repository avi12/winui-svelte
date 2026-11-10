import { typeAwareEnvironment } from "./type-aware-environment.ts";
import { spawnSync } from "node:child_process";
import path from "node:path";

// `pnpm lint:oxlint`: oxlint with its type-aware rules, run by tsrs-lint (type-aware-environment.ts).
// Arguments after the script name go to oxlint, so `--fix` and file paths work.

const PACKAGE_ROOT = path.join(import.meta.dirname, "..", "..");
const OXLINT_SCRIPT = path.join(PACKAGE_ROOT, "node_modules", "oxlint", "bin", "oxlint");
const FAILURE_STATUS = 1;

const result = spawnSync(process.execPath, [OXLINT_SCRIPT, "--type-aware", ...process.argv.slice(2)], {
  cwd: PACKAGE_ROOT,
  env: typeAwareEnvironment(),
  stdio: "inherit"
});
process.exitCode = result.status ?? FAILURE_STATUS;
