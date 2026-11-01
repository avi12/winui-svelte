import {
  copyShippedFile,
  isAliasedFile,
  isShipped,
  OUTPUT_FOLDER,
  PACKAGE_ROOT,
  resolveAliasesIn,
  shippedTarget,
  SOURCE_FOLDER
} from "#scripts/pack/dist-files.ts";
import { spawn, spawnSync } from "node:child_process";
import { existsSync, rmSync, watch } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";

// Keeps dist/ current while the sources change, for an app that links this
// package: one build, then tsc's own watcher for the TypeScript and, for what
// tsc does not emit, a copy of each .svelte, declaration and .json file the
// moment it is saved. tsc writes `#src/` imports that dist/ cannot resolve, so
// each file it emits is rewritten as the full build does.

const BUILD_SCRIPT = path.join(import.meta.dirname, "build.ts");
const SETTLE_MILLISECONDS = 60;
const RETRY_MILLISECONDS = 150;

function isReadError(error: unknown) {
  return error instanceof Error && "code" in error && ["EBUSY", "ENOENT", "EPERM"].includes(String(error.code));
}

// A file tsc is still writing, or an editor is saving, cannot be read yet.
function retrying(action: () => void) {
  try {
    action();
  } catch (error) {
    if (!isReadError(error)) {
      throw error;
    }

    setTimeout(() => {
      try {
        action();
      } catch (retryError) {
        if (!isReadError(retryError)) {
          throw retryError;
        }
      }
    }, RETRY_MILLISECONDS);
  }
}

const pending = new Map<string, NodeJS.Timeout>();

function settled({ file, action }: {
  file: string;
  action: () => void;
}) {
  clearTimeout(pending.get(file));
  const timer = setTimeout(() => {
    pending.delete(file);
    retrying(action);
  }, SETTLE_MILLISECONDS);
  pending.set(file, timer);
}

function onSourceChange(name: string) {
  const file = path.join(SOURCE_FOLDER, name);
  if (!isShipped(file)) {
    return;
  }

  settled({
    file,
    action() {
      const target = shippedTarget(file);
      if (!existsSync(file)) {
        rmSync(target, { force: true });
        return;
      }

      copyShippedFile(file);
      resolveAliasesIn(target);
      process.stdout.write(`copied ${name}\n`);
    }
  });
}

function onOutputChange(name: string) {
  const file = path.join(OUTPUT_FOLDER, name);
  const isCandidate = isAliasedFile(file) && !file.includes(`${path.sep}bindings${path.sep}`);
  if (!isCandidate) {
    return;
  }

  settled({
    file,
    action() {
      if (existsSync(file)) {
        resolveAliasesIn(file);
      }
    }
  });
}

const built = spawnSync(process.execPath, ["--disable-warning=ExperimentalWarning", BUILD_SCRIPT], {
  cwd: PACKAGE_ROOT,
  stdio: "inherit"
});
const IS_BUILD_FAILED = built.status !== 0;
if (IS_BUILD_FAILED) {
  process.exit(built.status ?? 1);
}

const TSC = createRequire(import.meta.url).resolve("typescript/bin/tsc");
const compiler = spawn(process.execPath, [TSC, "-p", path.join(PACKAGE_ROOT, "tsconfig.build.json"), "--watch", "--preserveWatchOutput"], {
  cwd: PACKAGE_ROOT,
  stdio: "inherit"
});

watch(SOURCE_FOLDER, { recursive: true }, (_event, name) => {
  const isNamed = name !== null;
  if (isNamed) {
    onSourceChange(name);
  }
});
watch(OUTPUT_FOLDER, { recursive: true }, (_event, name) => {
  const isNamed = name !== null;
  if (isNamed) {
    onOutputChange(name);
  }
});

process.on("SIGINT", () => {
  compiler.kill();
  process.exit(0);
});
compiler.on("exit", code => {
  process.exit(code ?? 0);
});
process.stdout.write("dist follows the sources: save a file in src\n");
