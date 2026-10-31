import { invocationOf } from "./package-manager.ts";
import assert from "node:assert/strict";
import { test } from "node:test";

const NODE = "C:\node\node.exe";

test("a pnpm script runs through node", () => {
  assert.deepEqual(
    invocationOf({
      execPath: "C:pnpm\binpnpm.cjs",
      nodePath: NODE,
      args: ["run", "build"]
    }),
    {
      command: NODE,
      args: ["C:pnpm\binpnpm.cjs", "run", "build"]
    }
  );
});

test("the standalone pnpm executable is spawned directly", () => {
  assert.deepEqual(
    invocationOf({
      execPath: "C:pnpmPNPM.EXE",
      nodePath: NODE,
      args: ["run", "build"]
    }),
    {
      command: "C:pnpmPNPM.EXE",
      args: ["run", "build"]
    }
  );
});
