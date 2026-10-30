import { compileSheetModule, scopeClassOf, scopedMarkup, SheetError } from "./sheet-module.ts";
import { loadWinuiCatalogue } from "#src/css/translate/catalogue.js";
import assert from "node:assert/strict";
import { tmpdir } from "node:os";
import path from "node:path";
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
    runes: true
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

test("a flex row written as a grid is lowered into tracks and placed children that the translator accepts", () => {
  const result = moduleFor(
    `<grid class="row"><button class="a">A</button><text-block class="b">B</text-block></grid>

<style>
  .row { display: flex; align-items: center; gap: 8px }
  .b { flex: 1 }
  .a { align-self: end }
</style>
`
  );
  const rules = result?.sheet.rules.map(rule => [rule.specificity, rule.declarations.map(({ property, value }) => `${property}:${value}`)]);
  assert.deepEqual(rules, [
    [0, ["grid-template-columns:auto 1fr"]],
    [0, ["grid-column-start:1", "align-self:center"]],
    [0, ["grid-column-start:2", "align-self:center"]],
    [2, ["row-gap:8px", "column-gap:8px"]],
    [2, ["align-self:end"]]
  ]);
});

test("a container the build cannot lower is still the translator's error", () => {
  assert.throws(
    () => moduleFor("<border class=\"b\"><button/></border>\n\n<style>\n  .b { align-items: center }\n</style>\n"),
    (error: unknown) => error instanceof SheetError && /align-items has no WinUI meaning \(is lowered by the component build/u.test(error.message)
  );
});

// WebStorm reads the component source below as Svelte, where `extra` and the
// directives have no declaration.
// noinspection JSUnresolvedReference
const PARENT = `<script>
  import { TextBlock, StackPanel } from "winui-svelte/components";
  let { extra } = $props();
</script>
<StackPanel class="page"><TextBlock class="title">Hi</TextBlock><TextBlock class={extra}>x</TextBlock><TextBlock>y</TextBlock><text-block class="title"/></StackPanel>
<style>
  .page { padding: 4px }
  .title { font-size: 20px }
  :global(.shared) { gap: 3px }
  .missing { opacity: 0.5 }
</style>
`;

test("a rule reaches the component instances of its own markup, and a global one stays unscoped", () => {
  const result = moduleFor(PARENT);
  const scope = scopeClassOf({ filename: FILENAME });
  assert.deepEqual(result?.sheet.rules.slice(0, 3).map(rule => rule.classes), [
    ["page", scope],
    ["title", scope],
    ["shared"]
  ]);
  const unused = moduleFor("<StackPanel class=\"page\"/><style>.page { gap: 1px } .missing { gap: 2px }</style>");
  assert.match(unused?.diagnostics.map(({ message }) => message).join() ?? "", /missing/u);
});

test("every instance of the component carries the scope class, in a string or an array", () => {
  const scope = scopeClassOf({ filename: FILENAME });
  const markup = scopedMarkup({
    source: PARENT,
    file: "t.svelte",
    filename: FILENAME
  });
  assert.match(markup, new RegExp(`<StackPanel class="page ${scope}">`, "u"));
  assert.match(markup, new RegExp(`<TextBlock class="title ${scope}">`, "u"));
  assert.ok(markup.includes(`class={[extra, "${scope}"]}`));
  assert.match(markup, new RegExp(`<TextBlock class="${scope}">y`, "u"));
});

test("two components with one class name get different scopes", () => {
  assert.notEqual(scopeClassOf({ filename: "/a/One.svelte" }), scopeClassOf({ filename: "/a/Two.svelte" }));
});

test("two components with the same class name register rules that do not collide", () => {
  const markup = "<StackPanel class=\"box\"><TextBlock class=\"title\"/></StackPanel>";
  const sheets = [["/app/One.svelte", "12px"], ["/app/Two.svelte", "30px"]].map(([filename, gap]) => ({
    filename: filename ?? "",
    sheet: compileSheetModule({
      filename: filename ?? "",
      source: `${markup}<style>.box { gap: ${gap} } .title { font-size: ${gap} }</style>`,
      sheetId: "t.svelte",
      resources,
      runtimeModule: "winui-svelte/css"
    })?.sheet
  }));
  for (const { filename, sheet } of sheets) {
    const scope = scopeClassOf({ filename });
    assert.ok(sheet?.rules.every(rule => rule.classes.includes(scope)));
    const compiled = scopedMarkup({
      source: `${markup}<style>.box { gap: 1px }</style>`,
      file: "t.svelte",
      filename
    });
    assert.ok(compiled.includes(`class="title ${scope}"`));
  }

  assert.notEqual(sheets[0]?.sheet?.rules[0]?.classes[1], sheets[1]?.sheet?.rules[0]?.classes[1]);
});

test("style: and class: directives on a component become reactive props", () => {
  // noinspection JSUnresolvedReference
  const markup = scopedMarkup({
    source: "<TextBlock class=\"a\" style=\"color: red\" style:padding=\"{p}px\" style:--gap={gap} style:margin|important=\"1px\" class:on={isOn} class:big />",
    file: "t.svelte",
    filename: FILENAME
  });
  assert.ok(markup.includes("class={[`a`, {"));
  assert.ok(markup.includes("\"on\": isOn"));
  assert.ok(markup.includes("\"big\": big"));
  assert.ok(markup.includes("padding: ${value}") && markup.includes("`${p}px`"));
  assert.ok(markup.includes("--gap: ${value}"));
  assert.ok(markup.includes("margin: ${value} !important"));
  assert.ok(!markup.includes("style:") && !markup.includes("class:"));
  const compiled = compile(markup, {
    filename: FILENAME,
    generate: "client",
    runes: true
  });
  assert.ok(compiled.js.code.includes("TextBlock"));
});

test("the scope class of an instance is the class Svelte puts on the rule, from any working folder", () => {
  const filename = path.resolve("examples/media/Probe.svelte");
  const source = "<StackPanel class=\"box\"/><i class=\"box\"></i><style>.box { gap: 4px }</style>";
  const here = process.cwd();
  process.chdir(tmpdir());
  try {
    const markup = scopedMarkup({
      source,
      file: filename,
      filename
    });
    const compiled = compile(markup, {
      filename,
      generate: "client",
      css: "external"
    });
    const scope = scopeClassOf({ filename });
    assert.ok(compiled.css?.code.includes(`.box.${scope}`), compiled.css?.code);
    assert.match(markup, new RegExp(`<StackPanel class="box ${scope}"`, "u"));
  } finally {
    process.chdir(here);
  }
});
