import { SVELTE_MATRIX } from "./matrix.ts";
import { SVELTE_ROOT_ENV } from "#src/vite/svelte-resolve.js";
import { spawnSync } from "node:child_process";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { parseArgs } from "node:util";

// pnpm check:svelte-matrix [--version 5.57.3] [--install-only]
// Installs each release of the matrix from the npm registry into
// .verify/svelte-<version> (its own folder; the shared node_modules is never
// touched), checks the tarball's integrity against the matrix, and runs the
// renderer, host, tree, blocks and transition tests with the loader pointed at
// that copy (after one `pnpm build`, which the tests read). Slow (a few minutes), so it is not part of `pnpm lint`.

const PACKAGE_ROOT = path.join(import.meta.dirname, "..", "..");
const VERIFY_ROOT = path.join(PACKAGE_ROOT, ".verify");
const TEST_TIMEOUT_MS = 120000;
const TEST_FILES = [
  "src/renderer/**/*.test.ts",
  "src/components/runtime.test.ts",
  "src/components/hand-written/navigation/navigator-host.test.ts",
  "scripts/svelte-matrix/anchors.test.ts"
];
const PRELOAD = "./scripts/svelte-matrix/preload.ts";

function installFolder(version: string) {
  return path.join(VERIFY_ROOT, `svelte-${version}`);
}

function install({ version, integrity }: {
  version: string;
  integrity: string;
}) {
  const folder = installFolder(version);
  mkdirSync(folder, {
    recursive: true
  });
  const manifest = JSON.stringify({
    private: true,
    dependencies: {
      svelte: version
    }
  });
  writeFileSync(path.join(folder, "package.json"), manifest);
  const installed = spawnSync("pnpm install --ignore-workspace --ignore-scripts", {
    cwd: folder,
    encoding: "utf8",
    shell: true
  });
  const isInstalled = installed.status === 0;
  if (!isInstalled) {
    return `install failed: ${installed.stderr}${installed.stdout}`;
  }

  const lockfile = readFileSync(path.join(folder, "pnpm-lock.yaml"), "utf8");
  const isPinned = lockfile.includes(`integrity: ${integrity}`);
  return isPinned ? undefined : `integrity of svelte@${version} is not the one in scripts/svelte-matrix/versions.json`;
}

function runTests(version: string) {
  const result = spawnSync(process.execPath, [
    "--disable-warning=ExperimentalWarning",
    "--import",
    PRELOAD,
    "--test",
    `--test-timeout=${TEST_TIMEOUT_MS}`,
    ...TEST_FILES
  ], {
    cwd: PACKAGE_ROOT,
    encoding: "utf8",
    env: {
      ...process.env,
      [SVELTE_ROOT_ENV]: installFolder(version)
    }
  });
  const output = `${result.stdout}${result.stderr}`;
  const failures = output.split("\n").filter(line => /^\s*(?:Error|TypeError|AssertionError)|cannot read Svelte/u.test(line));
  return result.status === 0 ? undefined : failures.slice(0, 1).join(" | ") || "tests failed";
}

const built = spawnSync("pnpm build", {
  cwd: PACKAGE_ROOT,
  encoding: "utf8",
  shell: true
});
const IS_BUILT = built.status === 0;
if (!IS_BUILT) {
  throw new Error(`pnpm build failed: ${built.stderr}`);
}

const { values } = parseArgs({
  options: {
    version: {
      type: "string"
    },
    "install-only": {
      type: "boolean"
    }
  }
});
const selected = SVELTE_MATRIX.filter(({ version }) => values.version === undefined || values.version === version);
let failed = 0;
for (const entry of selected) {
  const problem = install(entry) ?? (values["install-only"] ? undefined : runTests(entry.version));
  failed += problem === undefined ? 0 : 1;
  console.log(`${problem === undefined ? "pass" : "FAIL"} svelte@${entry.version}${problem === undefined ? "" : `: ${problem}`}`);
}

process.exitCode = failed === 0 ? 0 : 1;
