import assert from "node:assert/strict";
import { test } from "node:test";

const { handleLifecycle, launchState, parseLifecycle, feedFileName } = await import("./index.ts");

test("parses a lifecycle start and ignores a normal one", () => {
  assert.deepEqual(parseLifecycle(["--tray", "--updated", "1.2.0"]), {
    event: "updated",
    version: "1.2.0"
  });
  assert.equal(parseLifecycle(["--nonsense", "1.2.0"]), undefined);
  assert.equal(parseLifecycle(["--open"]), undefined);
});

test("runs the matching handler and reports it handled", async () => {
  const seen: string[] = [];
  const isHandled = await handleLifecycle({
    argv: ["--uninstall", "2.0.0"],
    handlers: {
      uninstall({ version }) {
        seen.push(version ?? "");
      }
    }
  });
  assert.equal(isHandled, true);
  assert.deepEqual(seen, ["2.0.0"]);
  assert.equal(
    await handleLifecycle({
      argv: [],
      handlers: {}
    }), false
  );
});

test("reads the launch flags and names channel feeds", () => {
  assert.deepEqual(
    launchState({
      WINUI_SVELTE_FIRST_RUN: "1"
    }), {
      isFirstRun: true,
      isRestarted: false
    }
  );
  assert.equal(feedFileName(), "releases.json");
  assert.equal(feedFileName("beta"), "releases.beta.json");
});
