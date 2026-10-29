import { resolveRelationalSelectors } from "./relational.ts";
import assert from "node:assert/strict";
import { test } from "node:test";

function resolve({ markup, css }: {
  markup: string;
  css: string;
}) {
  return resolveRelationalSelectors({
    source: `${markup}\n<style>\n${css}\n</style>`,
    file: "t.svelte"
  });
}

const LIST = "<stack-panel class=\"list\"><border class=\"item\"/><border class=\"item\"/><border class=\"item\"/></stack-panel>";

test("a child combinator gives the matching elements a class and rewrites the selector", () => {
  const { source, diagnostics } = resolve({
    markup: LIST,
    css: ".list > .item { opacity: 0.5 }"
  });
  assert.deepEqual(diagnostics, []);
  assert.equal(source.match(/class="item wsc-1"/gu)?.length, 3);
  assert.match(source, /\.wsc-1 \{ opacity: 0\.5 \}/u);
});

test(":first-child and :last-child pick one element each, and keep a state on the subject", () => {
  const { source, diagnostics } = resolve({
    markup: LIST,
    css: ".item:first-child:hover { opacity: 0.5 }\n.item:last-child { opacity: 0.1 }"
  });
  assert.deepEqual(diagnostics, []);
  assert.match(source, /<border class="item wsc-1"\/><border class="item"\/><border class="item wsc-2"\/>/u);
  assert.match(source, /\.wsc-1:hover \{/u);
});

test(":nth-child takes an+b, odd and even", () => {
  const { source } = resolve({
    markup: LIST,
    css: ".item:nth-child(2n+1) { opacity: 0.5 }\n.item:nth-child(2) { opacity: 0.2 }"
  });
  assert.match(source, /<border class="item wsc-1"\/><border class="item wsc-2"\/><border class="item wsc-1"\/>/u);
});

test("sibling combinators and :is() and :not() work on a static list", () => {
  const { source, diagnostics } = resolve({
    markup: "<stack-panel><border class=\"a\"/><border class=\"b\"/><border class=\"c\"/></stack-panel>",
    css: ".a + .b { opacity: 1 }\n.a ~ .c { opacity: 1 }\n:is(.a, .c):not(.x) { opacity: 1 }"
  });
  assert.deepEqual(diagnostics, []);
  assert.match(source, /<border class="a wsc-3"\/><border class="b wsc-1"\/><border class="c wsc-2 wsc-3"\/>/u);
});

test("a descendant selector reaches through blocks, and an element with no class gets one", () => {
  const { source, diagnostics } = resolve({
    markup: "<stack-panel class=\"card\">{#if true}<border><text-block/></border>{/if}</stack-panel>",
    css: ".card text-block { opacity: 1 }"
  });
  assert.deepEqual(diagnostics, []);
  assert.match(source, /<text-block class="wsc-1"\/>/u);
});

test("a position among siblings that an {#each}, a component or the root leaves open is an error", () => {
  for (const [markup, css] of [
    ["<stack-panel>{#each [1] as n}<border class=\"item\"/>{/each}</stack-panel>", ".item:first-child { opacity: 1 }"],
    ["<stack-panel><Foo/><border class=\"item\"/></stack-panel>", ".item:first-child { opacity: 1 }"],
    ["<border class=\"item\"/>", ".item:last-child { opacity: 1 }"]
  ] as const) {
    const { diagnostics } = resolve({
      markup,
      css
    });
    assert.match(diagnostics.map(diagnostic => diagnostic.message).join(), /position is not fixed/u, markup);
  }
});

test("a class set by an expression, :has() and the state of an ancestor are errors", () => {
  const dynamic = resolve({
    markup: "<stack-panel><border class={x}/></stack-panel>",
    css: "stack-panel > .item { opacity: 1 }"
  });
  assert.match(dynamic.diagnostics[0]?.message ?? "", /set by an expression/u);
  assert.match(
    resolve({
      markup: LIST,
      css: ".list:has(.item) { opacity: 1 }"
    }).diagnostics[0]?.message ?? "", /:has\(\) has no WinUI meaning/u
  );
  assert.match(
    resolve({
      markup: LIST,
      css: ".list:hover > .item { opacity: 1 }"
    }).diagnostics[0]?.message ?? "", /other than the one styled/u
  );
});

test("a component with no relational selector is left alone", () => {
  const input = `${LIST}\n<style>\n.item { opacity: 1 }\n</style>`;
  assert.equal(
    resolveRelationalSelectors({
      source: input,
      file: "t.svelte"
    }).source, input
  );
});

test("a rule nested in another is flattened first, then matched against the markup", () => {
  const { source, diagnostics } = resolve({
    markup: LIST,
    css: ".list { opacity: 1; > .item { opacity: 0.5; &:hover { opacity: 0.2 } } }"
  });
  assert.deepEqual(diagnostics, []);
  assert.equal(source.match(/class="item wsc-1 wsc-2"/gu)?.length, 3);
  assert.match(source, /\.list \{ opacity: 1;\s+\}/u);
  assert.match(source, /\.wsc-1 \{ opacity: 0\.5; \}/u);
  assert.match(source, /\.wsc-2:hover \{ opacity: 0\.2; \}/u);
});

test("a nested rule that needs no markup stays where it is", () => {
  const { source } = resolve({
    markup: LIST,
    css: ".item { opacity: 1; &:hover { opacity: 0.5 } }"
  });
  assert.match(source, /&:hover \{ opacity: 0\.5 \}/u);
});

test("@scope is written out under its root and matched", () => {
  const { source, diagnostics } = resolve({
    markup: "<stack-panel class=\"card\"><border class=\"title\"/></stack-panel><border class=\"title\"/>",
    css: "@scope (.card) { :scope { opacity: 1 } .title { opacity: 0.5 } }"
  });
  assert.deepEqual(diagnostics, []);
  assert.doesNotMatch(source, /@scope/u);
  assert.match(source, /\.card \{ opacity: 1; \}/u);
  assert.match(source, /<stack-panel class="card"><border class="title wsc-1"\/><\/stack-panel><border class="title"\/>/u);
});

test("an @scope limit leaves out what is under the limit", () => {
  const { source } = resolve({
    markup: "<stack-panel class=\"card\"><border class=\"title\"/><border class=\"slot\"><border class=\"title\"/></border></stack-panel>",
    css: "@scope (.card) to (.slot) { .title { opacity: 0.5 } }"
  });
  assert.match(source, /<border class="title wsc-1"\/><border class="slot"><border class="title"\/><\/border>/u);
});

test("an @scope without a root is an error", () => {
  const { diagnostics } = resolve({
    markup: LIST,
    css: "@scope { .item { opacity: 1 } }"
  });
  assert.match(diagnostics[0]?.message ?? "", /@scope must be written/u);
});
