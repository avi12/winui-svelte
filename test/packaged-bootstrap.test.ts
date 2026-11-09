import { IS_WINDOWS_APP_SDK_RESTORED } from "./example-process.ts";
import {
  isPackagedTestEnabled,
  PACKAGED_TEST_VARIABLE,
  runInTestPackage,
  withTestPackage
} from "./support/test-package.ts";
import { RuntimeSource } from "#src/window/bootstrap-mode.js";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { test } from "node:test";
import { z } from "zod";

// initWindowsAppSdk in a process that has a package identity: a throwaway
// loose layout package whose manifest declares the Windows App SDK
// PackageDependency (test/support/test-package.ts), a relay run under its
// identity, and the window example it starts. The bootstrapper refuses to run
// there (0x80070032), so the default `auto` must skip it, still put the
// WebView2 profile under LOCALAPPDATA and still open a real window.
// It registers a package on this machine, so it runs only with
// WINUI_SVELTE_PACKAGED_TEST=1, in an ordinary desktop session.

const TIMEOUT_MILLISECONDS = 420_000;
const RELAY = path.join(import.meta.dirname, "packaged-bootstrap-relay.ts");

const answerSchema = z.object({
  runtime: z.object({
    runtime: z.string(),
    webViewUserDataFolder: z.string()
  }),
  info: z.object({
    title: z.string(),
    width: z.number()
  })
});

test(`a packaged process starts without the bootstrapper (${PACKAGED_TEST_VARIABLE}=1)`, {
  skip: !isPackagedTestEnabled() || !IS_WINDOWS_APP_SDK_RESTORED,
  timeout: TIMEOUT_MILLISECONDS
}, async () => {
  const scratch = mkdtempSync(path.join(tmpdir(), "winui-svelte-packaged-bootstrap-"));
  try {
    const raw = await withTestPackage({
      use: testPackage => runInTestPackage({
        testPackage,
        run: {
          script: RELAY,
          resultFile: path.join(scratch, "answer.json"),
          timeoutMilliseconds: TIMEOUT_MILLISECONDS - 60_000
        }
      })
    });
    const reported = answerSchema.parse(raw);
    assert.equal(reported.runtime.runtime, RuntimeSource.package);
    assert.equal(reported.info.title, "Window example");
    assert.ok(reported.info.width > 0);
    const profile = reported.runtime.webViewUserDataFolder.toLowerCase();
    assert.ok(profile.startsWith((process.env["LOCALAPPDATA"] ?? "").toLowerCase()), profile);
  } finally {
    rmSync(scratch, {
      recursive: true,
      force: true
    });
  }
});
