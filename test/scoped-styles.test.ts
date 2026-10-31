import { ExampleProcess, IS_WINDOWS_APP_SDK_RESTORED } from "./example-process.ts";
import type { Report } from "./example-process.ts";
import assert from "node:assert/strict";
import { test } from "node:test";
import { z } from "zod";

// test/scoped-styles in a real WinUI window, off screen and never activated:
// a class that only a Style prop names reaches the rule of the component's
// own <style> with no :global, and two components that name the same class
// keep their own rules. Skipped where the Windows App SDK was not restored.

const TIMEOUT_MILLISECONDS = 300_000;
const OWN_MIN_HEIGHT = 36;
const GLOBAL_MIN_HEIGHT = 44;
const RIVAL_MIN_HEIGHT = 50;
const GLOBAL_PADDING = 3;
const RIVAL_PADDING = 5;

const containerSchema = z.object({
  minHeight: z.number(),
  left: z.number(),
  top: z.number()
});
const containersSchema = z.record(z.string(), containerSchema.nullable());
const NAMES = ["literal", "expression", "conditional", "global", "rival"];

function containersOf(report: Report) {
  return containersSchema.parse(report["containers"]);
}

function isRealized(report: Report) {
  const containers = containersSchema.safeParse(report["containers"]);
  return containers.success && NAMES.every(name => containers.data[name] != null);
}

test("a class only a Style prop names reaches the component's scoped rule, and a rival's rule stays its own", {
  skip: !IS_WINDOWS_APP_SDK_RESTORED,
  timeout: TIMEOUT_MILLISECONDS
}, async () => {
  const example = ExampleProcess.start({ entry: "test/scoped-styles/main.ts" });
  try {
    const report = await example.ask({
      command: {
        cmd: "containers"
      },
      kind: "containers",
      isWanted: isRealized
    });
    const containers = containersOf(report);
    for (const name of ["literal", "expression", "conditional"]) {
      assert.deepEqual(containers[name], {
        minHeight: OWN_MIN_HEIGHT,
        left: 0,
        top: 0
      }, name);
    }

    assert.deepEqual(containers["global"], {
      minHeight: GLOBAL_MIN_HEIGHT,
      left: GLOBAL_PADDING,
      top: GLOBAL_PADDING
    }, "a :global rule still works");
    assert.deepEqual(containers["rival"], {
      minHeight: RIVAL_MIN_HEIGHT,
      left: RIVAL_PADDING,
      top: RIVAL_PADDING
    }, "the other component keeps its own .row");
  } finally {
    example.kill();
  }
});
