import { compileSheetModule, cssHash, SheetError } from "./sheet-module.ts";
import { loadWinuiCatalogue } from "#src/css/translate/catalogue.js";
import assert from "node:assert/strict";
import { test } from "node:test";
import { compile } from "svelte/compiler";

// Real Svelte compiles; the sheet must carry the class the elements get.

const resources = loadWinuiCatalogue();
const FILENAME = "C:/app/ui/card.svelte";

// WebStorm reads this template as a Svelte file and parses the custom
// property `--accent` in its <style> as a decrement of `accent`.
// noinspection JSUnresolvedReference
const SOURCE = `<border class="card" class:big={true}>
  <text-block class="title">hi</text-block>
</border>

<style>
  .card { padding: 12px 16px; background: var(--card-background-fill-color-default) }
  text-block.title { font-weight: 600 }
  :global(:root) { --accent: #0af }
  @media (prefers-color-scheme: dark) { :global(:root) { --accent: #fa0 } }
</style>
`;

function moduleFor(text: string) {
  return compileSheetModule({
    filename: FILENAME,
    source: text,
    sheetId: "ui/card.svelte",
    resources,
    runtimeModule: "winui-svelte/css"
  });
}

test("the sheet's selectors carry the class the component's elements get", () => {
  const result = moduleFor(SOURCE);
  const component = compile(SOURCE, {
    filename: FILENAME,
    generate: "client",
    runes: true,
    cssHash
  });
  const scope = /svelte-[\w-]+/u.exec(component.js.code)?.[0];
  assert.ok(scope !== undefined);
  assert.deepEqual(result?.sheet.rules.map(rule => [rule.elementType, rule.classes]), [
    [null, ["card", scope]],
    ["text-block", ["title", scope]]
  ]);
  assert.match(result?.sheet.resourcesXaml ?? "", /AccentBrush/u);
});

test("the module registers the sheet, and accepts hot updates when asked", () => {
  const result = compileSheetModule({
    filename: FILENAME,
    source: SOURCE,
    sheetId: "ui/card.svelte",
    resources,
    runtimeModule: "winui-svelte/css",
    isHot: true
  });
  assert.match(result?.code ?? "", /^import \{ registerStyleSheet as registerWinuiSheet \} from "winui-svelte\/css";/u);
  assert.match(result?.code ?? "", /registerWinuiSheet\(\{"id":"ui\/card\.svelte","rules":/u);
  assert.match(result?.code ?? "", /import\.meta\.hot\.accept\(\)/u);
  assert.doesNotMatch(moduleFor(SOURCE)?.code ?? "", /import\.meta\.hot/u);
});

test("a component without a <style> has no sheet", () => {
  assert.equal(moduleFor("<border />"), null);
});

test("an error names the line of the .svelte file, not of the generated CSS", () => {
  const broken = `<border class="a" />\n\n<style>\n  .a {\n    color: red;\n    float: left;\n  }\n</style>\n`;
  assert.throws(() => moduleFor(broken), (error: Error) =>
    error instanceof SheetError && error.message.startsWith("ui/card.svelte:6:5: float has no WinUI meaning"));
});

test("a descendant selector is resolved against the markup into a generated class", () => {
  const nested = `<border class="a"><text-block class="b" /></border>
<style>
  .a .b { color: red }
</style>
`;
  const rules = moduleFor(nested)?.sheet.rules ?? [];
  assert.ok(rules.some(rule => rule.classes.includes("wsc-1")));
});

test("a descendant selector the markup cannot decide is reported at its rule", () => {
  const dynamic = `<border class={x}><text-block class="b" /></border>
<style>
  .a .b { color: red }
</style>
`;
  assert.throws(() => moduleFor(dynamic), (error: Error) =>
    error instanceof SheetError && error.message.startsWith("ui/card.svelte:3:3:") && error.message.includes("set by an expression"));
});

test("a sheet opts into the transform parser only when it has a transform", () => {
  assert.doesNotMatch(moduleFor(SOURCE)?.code ?? "", /winui-svelte\/css\/transform/u);
  const transformed = moduleFor(
    `<border class="card"></border>
<style>
  .card { transform: rotate(5deg) }
</style>
`
  );
  assert.match(transformed?.code ?? "", /import \{ transformGroups as \w+ \} from "winui-svelte\/css\/transform"/u);
  assert.doesNotMatch(transformed?.code ?? "", /css\/gradients/u);
  assert.match(transformed?.code ?? "", /registerPropertyGroups as \w+/u);
});

test("a sheet opts into the animation module for an animation", () => {
  const animated = moduleFor(
    `<border class="card"></border>
<style>
  @keyframes fade { from { opacity: 0 } to { opacity: 1 } }
  .card { animation: fade 1s }
</style>
`
  );
  assert.match(animated?.code ?? "", /import \{ animationGroups as \w+ \} from "winui-svelte\/css\/animation"/u);
  assert.match(animated?.code ?? "", /"keyframes":\[\{"name":"svelte-[\w-]+-fade"/u);
  assert.doesNotMatch(moduleFor(SOURCE)?.code ?? "", /css\/animation/u);
});

test("a sheet opts into the transform module for a transition", () => {
  const transitioned = moduleFor(
    `<border class="card"></border>
<style>
  .card { transition: opacity 200ms }
</style>
`
  );
  assert.match(transitioned?.code ?? "", /from "winui-svelte\/css\/transform"/u);
});

test("a sheet opts into the other groups by the properties it uses", () => {
  const code = moduleFor(
    `<border class="card"></border>
<style>
  .card { outline: 2px solid red; -winui-elevation: 8px; --button-background: red }
</style>
`
  )?.code ?? "";
  assert.match(code, /from "winui-svelte\/css\/focus"/u);
  assert.match(code, /from "winui-svelte\/css\/surface"/u);
  assert.match(code, /from "winui-svelte\/css\/resources"/u);
  assert.doesNotMatch(code, /css\/transform|css\/gradients/u);
  assert.equal(code.match(/registerPropertyGroups as/gu)?.length, 1);
});

test("a sheet opts into the gradient parser only when it has a gradient", () => {
  const plain = moduleFor(SOURCE);
  assert.doesNotMatch(plain?.code ?? "", /winui-svelte\/css\/gradients/u);

  const gradient = moduleFor(
    `<border class="card"></border>
<style>
  .card { background-image: linear-gradient(to right, red, blue) }
</style>
`
  );
  assert.match(gradient?.code ?? "", /import \{ gradientGroups as \w+ \} from "winui-svelte\/css\/gradients"/u);
  assert.match(gradient?.code ?? "", /registerPropertyGroups as \w+/u);
});
