import { winuiCss } from "./vite.ts";
import type { NativeValue } from "#src/native-value.js";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { test } from "node:test";

// The plugin's hooks called by hand, as Vite calls them.

const FOLDER = mkdtempSync(path.join(tmpdir(), "winui-css-")).replaceAll("\\", "/");
const STYLED = `${FOLDER}/styled.svelte`;
const PLAIN = `${FOLDER}/plain.svelte`;
const BROKEN = `${FOLDER}/broken.svelte`;
writeFileSync(STYLED, "<border class=\"a\" />\n<style>\n  .a { padding: 4px }\n</style>\n");
writeFileSync(PLAIN, "<border />\n");
writeFileSync(BROKEN, "<border class=\"a\" />\n<style>\n  .a { float: left }\n</style>\n");

const plugin = winuiCss({ root: FOLDER });
const warnings: string[] = [];
const context = {
  addWatchFile() {},
  resolve: (source: string) => Promise.resolve({ id: source.replace("/rooted/", `${FOLDER}/`) }),
  warn: (message: string) => warnings.push(message),
  error(message: string) {
    throw new Error(message);
  }
};

type HookResult = NativeValue | void;

// A hook called with its own `this`, as Vite calls it, whatever stand-in the
// test gives it for Vite's context.
function callHook({ hook, thisArg, args }: {
  hook: (...args: never[]) => HookResult;
  thisArg: object;
  args: NativeValue[];
}) {
  return Function.prototype.apply.call(hook, thisArg, args);
}

function run({ name, values }: {
  name: "transform" | "resolveId" | "load";
  values: string[];
}) {
  const found = plugin[name];
  const isFunction = typeof found === "function";
  if (!isFunction) {
    throw new TypeError(`${name} is not a function`);
  }

  return callHook({
    hook: found,
    thisArg: context,
    args: values
  });
}

test("a component with a <style> imports its sheet module", () => {
  const result = run({
    name: "transform",
    values: ["compiled();", STYLED]
  });
  assert.deepEqual(result, {
    code: `compiled();\nimport ${JSON.stringify(`${STYLED}-winui-css.js`)};\n`,
    map: null
  });
});

test("a component without one, and non-components, are left alone", () => {
  assert.equal(
    run({
      name: "transform",
      values: ["compiled();", PLAIN]
    }), null
  );
  assert.equal(
    run({
      name: "transform",
      values: ["compiled();", `${STYLED}?svelte&type=style&lang.css`]
    }), null
  );
  assert.equal(
    run({
      name: "transform",
      values: ["x", `${FOLDER}/a.ts`]
    }), null
  );
});

test("the sheet module is resolved to the component's own path, and loaded as the translated sheet", async () => {
  const id = `${STYLED}-winui-css.js`;
  assert.equal(
    await run({
      name: "resolveId",
      values: [id]
    }), id
  );
  // Vite hands a root-relative import to resolve(), which finds the file.
  assert.equal(
    await run({
      name: "resolveId",
      values: ["/rooted/styled.svelte-winui-css.js"]
    }), id
  );
  assert.equal(
    await run({
      name: "resolveId",
      values: ["./other.js"]
    }), null
  );
  const code = String(
    run({
      name: "load",
      values: [id]
    })
  );
  assert.match(code, /registerWinuiSheet\(/u);
  assert.match(code, /"id":"styled.svelte"/u);
  assert.match(code, /import\.meta\.hot\.accept\(\)/u);
});

test("a change to a component reloads its sheet module too", () => {
  const sheet = { id: `${STYLED}-winui-css.js` };
  const environment = {
    moduleGraph: {
      getModuleById: (id: string) => (id === sheet.id ? sheet : undefined)
    }
  };
  const hotUpdate = plugin.hotUpdate;
  const isFunction = typeof hotUpdate === "function";
  if (!isFunction) {
    throw new TypeError("hotUpdate is not a function");
  }

  const component = { id: STYLED };
  // A component with no sheet module is left to Vite's own reload.
  assert.deepEqual(
    callHook({
      hook: hotUpdate,
      thisArg: {
        environment
      },
      args: [{
        file: `${FOLDER}/new.svelte`,
        modules: [component]
      }]
    }), undefined
  );
  // After the component was compiled, an edit to its <style> alone is the
  // sheet's: the component keeps running.
  run({
    name: "transform",
    values: ["compiled();", STYLED]
  });
  assert.deepEqual(
    callHook({
      hook: hotUpdate,
      thisArg: {
        environment
      },
      args: [{
        file: STYLED,
        modules: [component]
      }]
    }), [sheet]
  );
  writeFileSync(STYLED, "<border class=\"a\" />\n<style>\n  .a { padding: 8px }\n</style>\n");
  assert.deepEqual(
    callHook({
      hook: hotUpdate,
      thisArg: {
        environment
      },
      args: [{
        file: STYLED,
        modules: [component]
      }]
    }), [sheet]
  );
  writeFileSync(STYLED, "<border class=\"b\" />\n<style>\n  .a { padding: 8px }\n</style>\n");
  assert.deepEqual(
    callHook({
      hook: hotUpdate,
      thisArg: {
        environment
      },
      args: [{
        file: STYLED,
        modules: [component]
      }]
    }), [component, sheet]
  );
  assert.equal(
    callHook({
      hook: hotUpdate,
      thisArg: {
        environment
      },
      args: [{
        file: PLAIN,
        modules: [component]
      }]
    }), undefined
  );
});

test("a sheet with an error fails the load with its line", () => {
  assert.throws(() => run({
    name: "load",
    values: [`${BROKEN}-winui-css.js`]
  }), /^Error: .*broken\.svelte:3:8: float has no WinUI meaning/u);
});

test.after(() => {
  rmSync(FOLDER, {
    recursive: true,
    force: true
  });
});
