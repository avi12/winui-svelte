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

const BUTTONS = "<button class=\"a\">A</button><button class=\"b\">B</button>";

test("align-items on a stack-panel row aligns each child vertically, and leaves the rest of the rule", () => {
  const { source, diagnostics } = resolve({
    markup: `<stack-panel class="bar">${BUTTONS}</stack-panel>`,
    css: ".bar { display: flex; align-items: center; gap: 4px }"
  });
  assert.deepEqual(diagnostics, []);
  assert.match(source, /<button class="a wsc-1">A<\/button><button class="b wsc-1">B<\/button>/u);
  assert.match(source, /:where\(\.wsc-1\) \{ align-self: center; \}/u);
  assert.match(source, /\.bar \{ display: flex; {2}gap: 4px \}/u);
  assert.doesNotMatch(source, /align-items/u);
});

test("in a column the cross axis is horizontal", () => {
  const { source } = resolve({
    markup: `<stack-panel class="col">${BUTTONS}</stack-panel>`,
    css: ".col { flex-direction: column; align-items: flex-end }"
  });
  assert.match(source, /:where\(\.wsc-1\) \{ justify-self: flex-end; \}/u);
});

test("the generated rule comes first and has no specificity, so a rule of the author wins", () => {
  const { source } = resolve({
    markup: `<stack-panel class="bar">${BUTTONS}</stack-panel>`,
    css: ".bar { align-items: center }\nbutton.a { align-self: end }"
  });
  assert.ok(source.indexOf(":where(.wsc-1)") < source.indexOf("button.a"));
});

test("a grid aligns on both axes, and place-items sets both", () => {
  const { source, diagnostics } = resolve({
    markup: `<grid class="g">${BUTTONS}</grid>`,
    css: ".g { display: grid; place-items: start center }"
  });
  assert.deepEqual(diagnostics, []);
  assert.match(source, /:where\(\.wsc-1\) \{ align-self: start; justify-self: center; \}/u);
});

test("an {#each} child gets the class on the repeated element", () => {
  const { source, diagnostics } = resolve({
    markup: "<stack-panel class=\"bar\">{#each items as item}<button class=\"a\">{item}</button>{/each}</stack-panel>",
    css: ".bar { align-items: center }"
  });
  assert.deepEqual(diagnostics, []);
  assert.match(source, /<button class="a wsc-1">/u);
});

test("a component child cannot take the class, and the error names the line", () => {
  const { diagnostics } = resolve({
    markup: "<stack-panel class=\"bar\"><Card/><button/></stack-panel>",
    css: ".bar { align-items: center }"
  });
  assert.match(diagnostics[0]?.message ?? "", /<stack-panel> \(line 1\) holds a component/u);
});

test("an alignment WinUI cannot say is an error at the declaration", () => {
  const { diagnostics } = resolve({
    markup: `<stack-panel class="bar">${BUTTONS}</stack-panel>`,
    css: ".bar { align-items: baseline }"
  });
  assert.match(diagnostics[0]?.message ?? "", /align-items: baseline has no WinUI meaning/u);
  assert.equal(diagnostics[0]?.at.line, 3);
});

test("justify-content that moves the children is an error on a stack-panel and points to a grid", () => {
  const { diagnostics } = resolve({
    markup: `<stack-panel class="bar">${BUTTONS}</stack-panel>`,
    css: ".bar { display: flex; justify-content: center }"
  });
  assert.match(diagnostics[0]?.message ?? "", /justify-content: center has no WinUI meaning here \(a stack-panel lays its children from the start/u);
});

test("flex-grow on a child of a stack-panel is an error that points to a grid", () => {
  const { diagnostics } = resolve({
    markup: `<stack-panel class="bar">${BUTTONS}</stack-panel>`,
    css: ".bar { display: flex }\n.a { flex: 1 }"
  });
  assert.match(diagnostics[0]?.message ?? "", /flex-grow: <button> \(line 1\) cannot take the free space of a <stack-panel>/u);
});

test("flex-basis on a stack child is its width in a row and its height in a column", () => {
  const row = resolve({
    markup: `<stack-panel class="bar">${BUTTONS}</stack-panel>`,
    css: ".bar { display: flex }\n.a { flex-basis: 120px }"
  });
  assert.match(row.source, /:where\(\.wsc-1\) \{ width: 120px; \}/u);
  const column = resolve({
    markup: `<stack-panel class="bar">${BUTTONS}</stack-panel>`,
    css: ".bar { flex-direction: column }\n.a { flex-basis: 40px }"
  });
  assert.match(column.source, /:where\(\.wsc-1\) \{ height: 40px; \}/u);
});

test("a flex row written as a grid gets a track for each child from its flex", () => {
  const { source, diagnostics } = resolve({
    markup: `<grid class="row">${BUTTONS}<button class="c">C</button></grid>`,
    css: ".row { display: flex; gap: 8px }\n.b { flex: 1 }\n.c { flex-basis: 80px; flex-shrink: 0 }"
  });
  assert.deepEqual(diagnostics, []);
  assert.match(source, /:where\(\.wsc-1\) \{ grid-template-columns: auto 1fr 80px; \}/u);
  assert.match(source, /<grid class="row wsc-1">/u);
  assert.match(source, /:where\(\.wsc-2\) \{ grid-column: 1; \}/u);
  assert.match(source, /:where\(\.wsc-3\) \{ grid-column: 2; \}/u);
  assert.match(source, /:where\(\.wsc-4\) \{ grid-column: 3; \}/u);
  assert.doesNotMatch(source, /display: flex|flex: 1|flex-basis/u);
  assert.match(source, /\.row \{ {2}gap: 8px \}/u);
});

test("a flex column written as a grid makes rows, with a minimum for a share and a basis", () => {
  const { source } = resolve({
    markup: `<grid class="col">${BUTTONS}</grid>`,
    css: ".col { display: flex; flex-direction: column }\n.a { flex: 2 1 30px }"
  });
  assert.match(source, /grid-template-rows: minmax\(30px, 2fr\) auto;/u);
  assert.match(source, /grid-row: 2;/u);
});

test("justify-content puts spacer tracks around and between the children when none of them grows", () => {
  const center = resolve({
    markup: `<grid class="row">${BUTTONS}</grid>`,
    css: ".row { display: flex; justify-content: center }"
  });
  assert.match(center.source, /grid-template-columns: 1fr auto auto 1fr;/u);
  assert.match(center.source, /grid-column: 2;/u);
  const between = resolve({
    markup: `<grid class="row">${BUTTONS}</grid>`,
    css: ".row { display: flex; justify-content: space-between }"
  });
  assert.match(between.source, /grid-template-columns: auto 1fr auto;/u);
  assert.match(between.source, /grid-column: 3;/u);
  const grown = resolve({
    markup: `<grid class="row">${BUTTONS}</grid>`,
    css: ".row { display: flex; justify-content: center }\n.a { flex-grow: 1 }"
  });
  assert.match(grown.source, /grid-template-columns: 1fr auto;/u);
});

test("a flex grid with an {#each} cannot know its tracks and says so", () => {
  const { diagnostics } = resolve({
    markup: "<grid class=\"row\">{#each items as item}<button>{item}</button>{/each}</grid>",
    css: ".row { display: flex }\nbutton { flex: 1 }"
  });
  assert.match(diagnostics[0]?.message ?? "", /<grid> \(line 1\) is a flex container whose tracks are made from its children/u);
});

test("a reversed direction has no WinUI meaning", () => {
  const { diagnostics } = resolve({
    markup: `<grid class="row">${BUTTONS}</grid>`,
    css: ".row { display: flex; flex-direction: row-reverse }"
  });
  assert.match(diagnostics[0]?.message ?? "", /flex-direction: row-reverse has no WinUI meaning/u);
});

test("order writes the children in that order, keeping the text between them and their classes", () => {
  const { source, diagnostics } = resolve({
    markup: "<stack-panel class=\"bar\">\n  <button class=\"a\">A</button>\n  <button class=\"b\">B</button>\n  <button class=\"c\">C</button>\n</stack-panel>",
    css: ".bar { display: flex; align-items: center }\n.a { order: 3 }\n.c { order: -1 }"
  });
  assert.deepEqual(diagnostics, []);
  assert.match(source, /<stack-panel class="bar">\n {2}<button class="c wsc-1">C<\/button>\n {2}<button class="b wsc-1">B<\/button>\n {2}<button class="a wsc-1">A<\/button>\n<\/stack-panel>/u);
  assert.doesNotMatch(source, /order:/u);
});

test("the tracks of a flex grid follow the order", () => {
  const { source } = resolve({
    markup: `<grid class="row">${BUTTONS}</grid>`,
    css: ".row { display: flex }\n.a { order: 1; flex-basis: 50px }\n.b { flex-basis: 20px }"
  });
  assert.match(source, /<button class="b wsc-\d">B<\/button><button class="a wsc-\d">A<\/button>/u);
  assert.match(source, /grid-template-columns: 20px 50px;/u);
});

test("order in a list that is not fixed in the markup is an error with its line", () => {
  const { diagnostics } = resolve({
    markup: "<stack-panel class=\"bar\">{#each items as item}<button class=\"a\">{item}</button>{/each}</stack-panel>",
    css: ".bar { display: flex }\n.a { order: 2 }"
  });
  assert.match(diagnostics[0]?.message ?? "", /order: <stack-panel> holds an \{#each\}, an \{#if\} or a component/u);
  assert.equal(diagnostics[0]?.at.line, 4);
});

test("order that is not a whole number is an error", () => {
  const { diagnostics } = resolve({
    markup: `<stack-panel class="bar">${BUTTONS}</stack-panel>`,
    css: ".bar { display: flex }\n.a { order: first }"
  });
  assert.match(diagnostics[0]?.message ?? "", /order: "first" must be a whole number/u);
});

test("a declaration stays where a rule also reaches an element that is not lowered", () => {
  const { source } = resolve({
    markup: `<stack-panel class="x">${BUTTONS}</stack-panel><border class="x"/>`,
    css: ".x { align-items: center }"
  });
  assert.match(source, /\.x \{ align-items: center \}/u);
});

test("a rule inside @media is left to the translator", () => {
  const { source, diagnostics } = resolve({
    markup: `<stack-panel class="bar">${BUTTONS}</stack-panel>`,
    css: "@media (min-width: 600px) { .bar { align-items: center } }"
  });
  assert.deepEqual(diagnostics, []);
  assert.match(source, /align-items: center/u);
  assert.doesNotMatch(source, /wsc-/u);
});

test("a container reached by a combinator selector is lowered too", () => {
  const { source, diagnostics } = resolve({
    markup: `<stack-panel class="card"><grid class="row">${BUTTONS}</grid></stack-panel>`,
    css: ".card > .row { display: flex }\n.card .row .a { flex: 1 }"
  });
  assert.deepEqual(diagnostics, []);
  assert.match(source, /grid-template-columns: 1fr auto;/u);
});
