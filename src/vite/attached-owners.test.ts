import { withAttachedOwners } from "./attached-owners.ts";
import assert from "node:assert/strict";
import { test } from "node:test";

const COMPILED = "export default function Component() {}";

test("a component that names an attached property loads its owner first", () => {
  const code = withAttachedOwners({
    source: "<border canvasLeft={7} gridRow={1} />",
    code: COMPILED
  });
  assert.match(code, /^export default function Component\(\) \{\}\nimport \{ preloadAttachedOwners as \w+ \} from "winui-svelte\/attached-owners";/u);
  assert.match(code, /await \w+\(\["Canvas","Grid"\]\);/u);
});

test("a component that names no attached property is left as it is", () => {
  const code = withAttachedOwners({
    source: "<border width={7} />",
    code: COMPILED
  });
  assert.equal(code, COMPILED);
});

test("a generated component that reads such a name from its props loads nothing", () => {
  const code = withAttachedOwners({
    source: "{#if isSnippet(rest.toolTip)}<property name=\"toolTip\">{@render rest.toolTip()}</property>{/if}",
    code: COMPILED
  });
  assert.equal(code, COMPILED);
});

test("a script that builds the props with an attached property loads its owner", () => {
  const code = withAttachedOwners({
    source: "<script>const props = { gridRow: 1, width: 2 };</script><border {...props} />",
    code: COMPILED
  });
  assert.match(code, /\(\["Grid"\]\)/u);
});

test("an owner is loaded once however many of its properties are named", () => {
  const code = withAttachedOwners({
    source: "<border canvasLeft={1} canvasTop={2} canvasZIndex={3} />",
    code: COMPILED
  });
  assert.match(code, /\(\["Canvas"\]\)/u);
});
