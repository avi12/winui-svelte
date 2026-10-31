import { LanguageServer } from "./language-server.ts";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import { after, before, test } from "node:test";

// A class that sets a property its element type lacks (`font-size` on a
// `PathIcon`) is an error in svelte-check and in the editor, at the rule, the
// same message the build gives; a property the type holds (`font-size` on a
// `TextBlock`) is silent. The package's own svelte.config.js is the setup
// consumers copy.

const PACKAGE_FOLDER = path.resolve(import.meta.dirname, "../..");
const VALID_FIXTURE = path.join(PACKAGE_FOLDER, "test", "ScopedInstances.fixture.svelte");
const INVALID_FIXTURE = path.join(PACKAGE_FOLDER, "test", "MismatchedClass.fixture.svelte");
const CLI_FOLDER = path.join(PACKAGE_FOLDER, ".verify", "element-properties");
const SERVER_TIMEOUT_MILLISECONDS = 300_000;
const CONFIG = readFileSync(path.join(PACKAGE_FOLDER, "svelte.config.js"), "utf8");
const MESSAGE = "property font-size is not supported on <path-icon>";
const INVALID_SOURCE = `<script lang="ts">
  import { PathIcon, StackPanel, TextBlock } from "winui-svelte/components";
</script>

<StackPanel>
  <TextBlock class="icon">Fine</TextBlock>
  <PathIcon class="icon" data="M0,0" />
</StackPanel>

<style>
  .icon {
    font-size: 16px;
  }
</style>
`;

const require = createRequire(import.meta.url);
const server = new LanguageServer(PACKAGE_FOLDER);

function errorsOf(source: string) {
  mkdirSync(CLI_FOLDER, { recursive: true });
  writeFileSync(path.join(CLI_FOLDER, "svelte.config.js"), CONFIG);
  writeFileSync(path.join(CLI_FOLDER, "Fixture.svelte"), source);
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

before(async () => {
  writeFileSync(INVALID_FIXTURE, INVALID_SOURCE);
  await server.start([PACKAGE_FOLDER]);
  server.open(VALID_FIXTURE);
  server.open(INVALID_FIXTURE);
  await server.settle([VALID_FIXTURE, INVALID_FIXTURE]);
}, { timeout: SERVER_TIMEOUT_MILLISECONDS });

after(() => {
  server.stop();
  rmSync(INVALID_FIXTURE, { force: true });
  rmSync(CLI_FOLDER, {
    recursive: true,
    force: true
  });
});

test("svelte-check errors on a property the styled element lacks, naming where the class is used", () => {
  const errors = errorsOf(INVALID_SOURCE);
  assert.equal(errors.length, 1);
  assert.ok(errors[0]?.includes(MESSAGE));
  assert.ok(errors[0]?.includes("used by .icon on <path-icon> at Fixture.svelte:7"));
});

test("svelte-check is silent when every element holds the property", () => {
  assert.deepEqual(errorsOf(readFileSync(VALID_FIXTURE, "utf8")), []);
});

test("the language server marks the same property", () => {
  const diagnostics = server.diagnosticsOf(INVALID_FIXTURE);
  assert.equal(diagnostics.length, 1);
  assert.ok(diagnostics[0]?.message.includes(MESSAGE));
});

test("the language server is silent when every element holds the property", () => {
  assert.deepEqual(server.diagnosticsOf(VALID_FIXTURE), []);
});
