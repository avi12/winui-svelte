import { withInstancesAsElements, withScopedInstances } from "./scope.ts";
import { unusedSelectorMessages } from "#src/css/runtime/sheet-module.js";
import assert from "node:assert/strict";
import { test } from "node:test";

const SCOPE = "svelte-abc123";
const FILE = "C:/project/list.svelte";
const STYLE = "<style>\n  .row {\n    padding: 0;\n  }\n</style>\n";

function scoped(markup: string) {
  return withScopedInstances({
    source: `${markup}\n${STYLE}`,
    scopeOf: () => SCOPE
  });
}

function unused(markup: string) {
  return unusedSelectorMessages({
    source: `<script>import { ListView } from "winui-svelte/components";</script>\n${markup}\n${STYLE}`,
    filename: FILE
  });
}

test("a Style prop written as text takes the scope class", () => {
  const code = scoped("<ListView itemContainerStyle=\"row\" />");
  assert.match(code, /itemContainerStyle="row svelte-abc123"/u);
});

test("a Style prop written as an expression becomes the value and the scope class", () => {
  const code = scoped("<ListView itemContainerStyle={cls} />");
  assert.match(code, /itemContainerStyle=\{\[\(cls\), "svelte-abc123"\]\}/u);
});

test("a conditional Style prop keeps the condition", () => {
  const code = scoped("<ListView itemContainerStyle={isOn ? \"row\" : \"other\"} />");
  assert.match(code, /itemContainerStyle=\{\[\(isOn \? "row" : "other"\), "svelte-abc123"\]\}/u);
});

test("a shorthand Style prop keeps its name", () => {
  const code = scoped("<ListView {itemContainerStyle} />");
  assert.match(code, /itemContainerStyle=\{\[\(itemContainerStyle\), "svelte-abc123"\]\}/u);
});

test("a prop that is not a Style prop is left alone", () => {
  const code = scoped("<ListView header=\"row\" />");
  assert.match(code, /header="row"/u);
  assert.doesNotMatch(code, /header="row svelte/u);
});

test("without a style block no scope class is added", () => {
  const code = withScopedInstances({
    source: "<ListView itemContainerStyle=\"row\" />",
    scopeOf: () => ""
  });
  assert.equal(code, "<ListView itemContainerStyle=\"row\" />");
});

test("the stand-in carries the Style prop's classes with the instance's own", () => {
  const code = withInstancesAsElements("<ListView class=\"list\" itemContainerStyle=\"row\" />");
  assert.match(code, /<winui-instance class="list row" \/>/u);
});

test("a rule for a class only a Style prop names is used, text or expression", () => {
  assert.deepEqual(unused("<ListView itemContainerStyle=\"row\" />"), []);
  assert.deepEqual(unused("<ListView itemContainerStyle={cls} />"), []);
  assert.deepEqual(unused("<ListView itemContainerStyle={isOn ? \"row\" : \"x\"} />"), []);
});

test("a rule for a class nothing names is still reported", () => {
  assert.equal(unused("<ListView itemContainerStyle=\"other\" />").length, 1);
});
