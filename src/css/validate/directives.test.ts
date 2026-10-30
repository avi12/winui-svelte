import { winuiPreprocess } from "./preprocess.ts";
import assert from "node:assert/strict";
import { test } from "node:test";
import { compile } from "svelte/compiler";

const SOURCE = [
  "<script>",
  "  import { TextBlock } from \"winui-svelte/components\";",
  "  let isActive = $state(true);",
  "</script>",
  "",
  "<TextBlock style:padding=\"4px\" class:active={isActive}>Hi</TextBlock>",
  ""
].join("\n");

test("the editor's markup hook lowers style: and class: on a component instance so Svelte's plain compiler accepts it", async () => {
  assert.throws(() => compile(SOURCE, { filename: "a.svelte" }), /component_invalid_directive|not valid on components/u);

  const preprocessor = winuiPreprocess();
  const lowered = await preprocessor.markup?.({
    content: SOURCE,
    filename: "a.svelte"
  });
  assert.ok(lowered?.code);
  assert.doesNotMatch(lowered.code, /style:|class:/u);
  assert.match(lowered.code, /style=\{/u);
  assert.match(lowered.code, /class=\{/u);
  compile(lowered.code, { filename: "a.svelte" });
});
