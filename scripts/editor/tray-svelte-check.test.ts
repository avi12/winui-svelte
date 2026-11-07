import { lowerTraySvelte } from "#src/vite/entrypoints/lower-tray-svelte.js";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import { after, test } from "node:test";

// A tray.svelte is checked like any component: its markup is typed by the
// props of the menu components (their .d.svelte.ts shims), so an attribute the
// model lacks, or a value of the wrong type, fails svelte-check even though the
// build lowers the file to plain code.

const PACKAGE_FOLDER = path.resolve(import.meta.dirname, "../..");
const CLI_FOLDER = path.join(PACKAGE_FOLDER, ".verify", "tray-svelte-check");
const EXAMPLE_FILE = path.join(PACKAGE_FOLDER, "examples", "tray-entrypoint-svelte", "entrypoints", "tray.svelte");
const CONFIG = readFileSync(path.join(PACKAGE_FOLDER, "svelte.config.js"), "utf8");
const CHECK_TIMEOUT_MILLISECONDS = 300_000;

const require = createRequire(import.meta.url);

function errorsOf(source: string) {
  mkdirSync(CLI_FOLDER, { recursive: true });
  writeFileSync(path.join(CLI_FOLDER, "svelte.config.js"), CONFIG);
  writeFileSync(path.join(CLI_FOLDER, "tray.svelte"), source);
  writeFileSync(
    path.join(CLI_FOLDER, "tsconfig.json"), JSON.stringify({
      extends: path.join(PACKAGE_FOLDER, "tsconfig.json"),
      include: ["*.svelte"]
    })
  );
  const result = spawnSync(process.execPath, [
    require.resolve("svelte-check/bin/svelte-check"),
    "--workspace",
    CLI_FOLDER,
    "--output",
    "machine"
  ], { encoding: "utf8" });
  return result.stdout.split("\n").filter(line => line.includes(" ERROR "));
}

after(() => {
  rmSync(CLI_FOLDER, {
    recursive: true,
    force: true
  });
});

test("svelte-check passes the example tray.svelte", { timeout: CHECK_TIMEOUT_MILLISECONDS }, () => {
  assert.deepEqual(errorsOf(readFileSync(EXAMPLE_FILE, "utf8")), []);
});

test("svelte-check fails an attribute the menu model lacks and a value of the wrong type", { timeout: CHECK_TIMEOUT_MILLISECONDS }, () => {
  // noinspection JSUnresolvedReference: Svelte markup in a string
  const errors = errorsOf(
    `<script module lang="ts">
  export const options = { icon: "tray.ico", guid: "g" };
</script>
<script lang="ts">
  import { TrayMenu, TrayMenuItem } from "winui-svelte/tray/menu/svelte";
</script>
<TrayMenu>
  <TrayMenuItem id="a" label="A" colour="red" />
  <TrayMenuItem id="b" label={42} />
</TrayMenu>`
  );
  assert.equal(errors.length, 2);
  assert.ok(errors.some(error => error.includes("colour")));
  assert.ok(errors.some(error => error.includes("number")));
});

test("the lowered code of the example type-checks against defineTray", { timeout: CHECK_TIMEOUT_MILLISECONDS }, () => {
  mkdirSync(CLI_FOLDER, { recursive: true });
  writeFileSync(
    path.join(CLI_FOLDER, "lowered.ts"), lowerTraySvelte({
      source: readFileSync(EXAMPLE_FILE, "utf8"),
      file: EXAMPLE_FILE
    })
  );
  writeFileSync(
    path.join(CLI_FOLDER, "tsconfig.lowered.json"), JSON.stringify({
      extends: path.join(PACKAGE_FOLDER, "tsconfig.json"),
      include: ["lowered.ts"],
      compilerOptions: {
        noUnusedLocals: false
      }
    })
  );
  const result = spawnSync(process.execPath, [
    require.resolve("typescript/bin/tsc"),
    "--noEmit",
    "--project",
    path.join(CLI_FOLDER, "tsconfig.lowered.json")
  ], { encoding: "utf8" });
  assert.equal(result.stdout.trim(), "");
});
