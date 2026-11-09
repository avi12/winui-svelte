import { startWindowsAppSdk, WindowsAppRuntimeMissing } from "./bootstrap-core.ts";
import type { RuntimeProcess } from "./bootstrap-core.ts";
import { BootstrapMode, RuntimeSource } from "./bootstrap-mode.ts";
import { BOOTSTRAPPER_NAME } from "#src/runtime-files.js";
import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, test } from "node:test";

const VARIABLES = ["PATH", "WEBVIEW2_USER_DATA_FOLDER", "WINAPPSDK_BOOTSTRAP_DLL_PATH"];
const PROFILE = path.join(tmpdir(), "winui-svelte-bootstrap-test-profile");
const MARKER = "0x80070032";

let saved: Record<string, string | undefined> = {};
let root = "";
let nativeFolder = "";
let emptyFolder = "";

beforeEach(() => {
  saved = Object.fromEntries(VARIABLES.map(name => [name, process.env[name]]));
  delete process.env["WINAPPSDK_BOOTSTRAP_DLL_PATH"];
  delete process.env["WEBVIEW2_USER_DATA_FOLDER"];
  root = mkdtempSync(path.join(tmpdir(), "bootstrap-core-"));
  nativeFolder = path.join(root, "native");
  emptyFolder = path.join(root, "empty");
  mkdirSync(nativeFolder);
  mkdirSync(emptyFolder);
  writeFileSync(path.join(nativeFolder, BOOTSTRAPPER_NAME), "");
});

afterEach(() => {
  for (const name of VARIABLES) {
    const value = saved[name];
    const isUnset = value === undefined;
    if (isUnset) {
      delete process.env[name];
    } else {
      process.env[name] = value;
    }
  }

  rmSync(root, {
    recursive: true,
    force: true
  });
});

function stand({ hasRuntime, failure }: {
  hasRuntime: boolean;
  failure?: Error;
}) {
  const calls: number[] = [];
  const runtimeProcess = {
    bootstrapperFolders: () => [],
    hasWindowsAppRuntimeDependency: () => hasRuntime,
    initWinappsdk(major: number) {
      calls.push(major);
      const isFailing = failure !== undefined;
      if (isFailing) {
        throw failure;
      }
    }
  } satisfies RuntimeProcess;
  return {
    calls,
    runtimeProcess
  };
}

function start({ runtimeProcess, folders, bootstrap }: {
  runtimeProcess: RuntimeProcess;
  folders: string[];
  bootstrap?: BootstrapMode;
}) {
  return startWindowsAppSdk({
    runtimeProcess,
    options: {
      dpiAwareness: undefined,
      webViewUserDataFolder: PROFILE,
      folders,
      ...(bootstrap === undefined ? {} : { bootstrap })
    }
  });
}

function assertEnvironment() {
  assert.equal(process.env["WEBVIEW2_USER_DATA_FOLDER"], PROFILE);
  assert.ok((process.env["PATH"] ?? "").split(path.delimiter).includes(nativeFolder), "native folder on PATH");
}

test("without a runtime in the package graph the bootstrapper is called", () => {
  const { calls, runtimeProcess } = stand({ hasRuntime: false });
  const result = start({
    runtimeProcess,
    folders: [nativeFolder]
  });
  assert.deepEqual(result, { runtime: RuntimeSource.bootstrapper });
  assert.equal(calls.length, 1);
  assertEnvironment();
});

test("with a runtime in the package graph auto skips the bootstrapper and keeps the environment", () => {
  const { calls, runtimeProcess } = stand({ hasRuntime: true });
  const result = start({
    runtimeProcess,
    folders: [nativeFolder]
  });
  assert.deepEqual(result, { runtime: RuntimeSource.package });
  assert.deepEqual(calls, []);
  assertEnvironment();
});

test("auto in a package does not need the bootstrapper to be found", () => {
  const { calls, runtimeProcess } = stand({ hasRuntime: true });
  const result = start({
    runtimeProcess,
    folders: [emptyFolder]
  });
  assert.equal(result.runtime, RuntimeSource.package);
  assert.deepEqual(calls, []);
  assert.equal(process.env["WEBVIEW2_USER_DATA_FOLDER"], PROFILE);
});

test("without a package the missing bootstrapper still throws", () => {
  const { runtimeProcess } = stand({ hasRuntime: false });
  assert.throws(() => start({
    runtimeProcess,
    folders: [emptyFolder]
  }), WindowsAppRuntimeMissing);
});

test("always calls the bootstrapper in a package and wraps its error", () => {
  const failure = new Error(`failed ${MARKER}`);
  const { calls, runtimeProcess } = stand({
    hasRuntime: true,
    failure
  });
  assert.throws(
    () => start({
      runtimeProcess,
      folders: [nativeFolder],
      bootstrap: BootstrapMode.always
    }),
    error => error instanceof WindowsAppRuntimeMissing && error.message.includes(MARKER) && error.cause === failure
  );
  assert.equal(calls.length, 1);
});

test("never skips the bootstrapper without a package, the environment still set", () => {
  const { calls, runtimeProcess } = stand({ hasRuntime: false });
  const result = start({
    runtimeProcess,
    folders: [nativeFolder],
    bootstrap: BootstrapMode.never
  });
  assert.equal(result.runtime, RuntimeSource.package);
  assert.deepEqual(calls, []);
  assertEnvironment();
});
