import { assertCustomRendererSvelte, customSvelteSource, isCustomRendererSvelte } from "./custom-svelte.ts";
import assert from "node:assert/strict";
import { test } from "node:test";

// What stock Svelte does with the option it does not know: nothing, so the
// output never imports the renderer.
function stockCompile(): {
  js: { code: string };
} {
  return {
    js: {
      code: "export default function App() {}"
    }
  };
}

function throwingCompile(): {
  js: { code: string };
} {
  throw new Error("unknown option");
}

test("the Svelte this repository installs is the custom-renderer build", () => {
  assert.equal(isCustomRendererSvelte(), true);
  assertCustomRendererSvelte();
});

test("a Svelte that ignores customRenderer is not accepted", () => {
  assert.equal(isCustomRendererSvelte(stockCompile), false);
});

test("a Svelte that rejects customRenderer is not accepted", () => {
  assert.equal(isCustomRendererSvelte(throwingCompile), false);
});

test("the error says what to install", () => {
  assert.throws(() => assertCustomRendererSvelte(stockCompile), error => {
    assert.ok(error instanceof Error);
    assert.ok(error.message.includes(`pnpm add -D svelte@${customSvelteSource}`));
    assert.ok(error.message.includes("overrides"));
    return true;
  });
});
