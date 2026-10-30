import { LanguageServer } from "./language-server.ts";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import { after, before, test } from "node:test";

// A rule that matches a component instance (`.title` for
// `<TextBlock class="title">`) must not warn in svelte-check or in the editor,
// and a rule that matches nothing must still warn. The package's own
// svelte.config.js is the setup consumers copy.

const PACKAGE_FOLDER = path.resolve(import.meta.dirname, "../..");
const MATCHED_FIXTURE = path.join(PACKAGE_FOLDER, "test", "ScopedInstances.fixture.svelte");
const UNMATCHED_FIXTURE = path.join(PACKAGE_FOLDER, "test", "UnmatchedSelector.fixture.svelte");
const CLI_FOLDER = path.join(PACKAGE_FOLDER, ".verify", "scoped-selectors");
const SERVER_TIMEOUT_MILLISECONDS = 300_000;
const UNUSED_SELECTOR = "css_unused_selector";
const WITH_FILTER = readFileSync(path.join(PACKAGE_FOLDER, "svelte.config.js"), "utf8");
const WITHOUT_FILTER = "import { winuiPreprocess } from \"winui-svelte/preprocess\";\n\nexport default { preprocess: [winuiPreprocess()] };\n";
const MATCHED_SOURCE = readFileSync(MATCHED_FIXTURE, "utf8");
const UNMATCHED_SOURCE = `${MATCHED_SOURCE.trimEnd().replace(/\n<\/style>$/u, "")}

  .missing {
    color: red;
  }
</style>
`;

const require = createRequire(import.meta.url);
const server = new LanguageServer(PACKAGE_FOLDER);

function warningsOf({ config, source }: {
  config: string;
  source: string;
}) {
  mkdirSync(CLI_FOLDER, { recursive: true });
  writeFileSync(path.join(CLI_FOLDER, "svelte.config.js"), config);
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
  return result.stdout.split("\n").filter(line => line.includes(" WARNING "));
}

before(async () => {
  writeFileSync(UNMATCHED_FIXTURE, UNMATCHED_SOURCE);
  await server.start([PACKAGE_FOLDER]);
  server.open(MATCHED_FIXTURE);
  server.open(UNMATCHED_FIXTURE);
  await server.settle([MATCHED_FIXTURE, UNMATCHED_FIXTURE]);
}, { timeout: SERVER_TIMEOUT_MILLISECONDS });

after(() => {
  server.stop();
  rmSync(UNMATCHED_FIXTURE, { force: true });
  rmSync(CLI_FOLDER, {
    recursive: true,
    force: true
  });
});

test("svelte-check without the filter warns for a rule that matches an instance", () => {
  const warnings = warningsOf({
    config: WITHOUT_FILTER,
    source: MATCHED_SOURCE
  });
  assert.equal(warnings.length, 2);
  assert.ok(warnings.every(line => line.includes(UNUSED_SELECTOR)));
});

test("svelte-check with the filter is silent for a rule that matches an instance", () => {
  assert.deepEqual(
    warningsOf({
      config: WITH_FILTER,
      source: MATCHED_SOURCE
    }), []
  );
});

test("svelte-check with the filter still warns for a rule that matches nothing", () => {
  const warnings = warningsOf({
    config: WITH_FILTER,
    source: UNMATCHED_SOURCE
  });
  assert.equal(warnings.length, 1);
  assert.ok(warnings[0]?.includes(".missing"));
});

test("the language server is silent for a rule that matches an instance", () => {
  assert.deepEqual(server.diagnosticsOf(MATCHED_FIXTURE), []);
});

test("the language server still warns for a rule that matches nothing", () => {
  const diagnostics = server.diagnosticsOf(UNMATCHED_FIXTURE);
  assert.equal(diagnostics.length, 1);
  assert.equal(diagnostics[0]?.code, UNUSED_SELECTOR);
  assert.ok(diagnostics[0]?.message.includes(".missing"));
});
