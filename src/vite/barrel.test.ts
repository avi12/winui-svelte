import { barrelImports } from "./barrel.ts";
import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { test } from "node:test";
import type { ResolvedConfig } from "vite";
import { parseAst } from "vite";

// A named import from a barrel loads the module that declares the name, so a
// window that uses three controls does not fetch six hundred.

const BARREL_SPECIFIER = "winui-svelte/components";

function transformOf({ barrel, importer, code, command }: {
  barrel: string;
  importer: string;
  code: string;
  command: "serve" | "build";
}) {
  const plugin = barrelImports();
  // The hooks use only the command, parse and resolve of Rollup's contexts.
  plugin.configResolved.call(undefined as never, { command } as ResolvedConfig);
  const context = {
    parse: parseAst,
    resolve: () => Promise.resolve({ id: barrel })
  };
  // The plugin context is Rollup's; the hook uses only parse and resolve.
  return plugin.transform.call(context as never, code, importer);
}

async function withBarrel(check: (barrel: string) => Promise<void>) {
  const root = mkdtempSync(path.join(tmpdir(), "winui-barrel-"));
  mkdirSync(path.join(root, "generated"));
  writeFileSync(path.join(root, "generated", "A.js"), "export default 1;\n");
  writeFileSync(path.join(root, "generated", "B.js"), "export default 2;\n");
  writeFileSync(path.join(root, "generated", "index.js"), "export { default as A } from \"./A.js\";\nexport { default as B } from \"./B.js\";\n");
  writeFileSync(path.join(root, "values.js"), "export const value = 3;\nexport function helper() {}\n");
  const barrel = path.join(root, "index.js");
  writeFileSync(barrel, "export * from \"./generated/index.js\";\nexport * from \"./values.js\";\nexport { helper as aid } from \"./values.js\";\n");
  try {
    await check(barrel);
  } finally {
    rmSync(root, {
      recursive: true,
      force: true
    });
  }
}

test("a named import of a barrel becomes imports of the modules that declare the names", async () => {
  await withBarrel(async barrel => {
    const code = `import { A, value, aid as help } from "${BARREL_SPECIFIER}";\nuse(A, value, help);\n`;
    const result = await transformOf({
      barrel,
      importer: "/app/App.svelte",
      code,
      command: "serve"
    });
    const root = path.dirname(barrel).replaceAll("\\", "/");
    assert.ok(result !== null && result !== undefined && typeof result === "object");
    assert.equal(result.code, `import { default as A } from "${root}/generated/A.js"; import { value, helper as help } from "${root}/values.js";\nuse(A, value, help);\n`);
  });
});

test("a namespace import, a build and an unrelated module are left alone", async () => {
  await withBarrel(async barrel => {
    const namespace = `import * as all from "${BARREL_SPECIFIER}";\n`;
    const named = `import { A } from "${BARREL_SPECIFIER}";\n`;
    assert.equal(
      await transformOf({
        barrel,
        importer: "/app/a.js",
        code: namespace,
        command: "serve"
      }), null
    );
    assert.equal(
      await transformOf({
        barrel,
        importer: "/app/a.js",
        code: named,
        command: "build"
      }), null
    );
    assert.equal(
      await transformOf({
        barrel,
        importer: "/app/a.js",
        code: "import { A } from \"./other.js\";\n",
        command: "serve"
      }), null
    );
  });
});

test("a barrel written in TypeScript, with type exports, is read too", async () => {
  const root = mkdtempSync(path.join(tmpdir(), "winui-barrel-"));
  try {
    writeFileSync(path.join(root, "A.ts"), "export default 1;\n");
    const barrel = path.join(root, "index.ts");
    writeFileSync(barrel, "export { default as A } from \"./A.ts\";\nexport type { Shape } from \"./shape.ts\";\n");
    const result = await transformOf({
      barrel,
      importer: "/app/App.svelte",
      code: `import { A } from "${BARREL_SPECIFIER}";\nuse(A);\n`,
      command: "serve"
    });
    assert.match(String(result?.code), /A\.ts/u);
  } finally {
    rmSync(root, {
      recursive: true,
      force: true
    });
  }
});
