import { createScaleTracker } from "./scale.ts";
import assert from "node:assert/strict";
import { test } from "node:test";

const SCALE_100_PERCENT = 1;
const SCALE_150_PERCENT = 1.5;
const SCALE_200_PERCENT = 2;

test("a check hears the scale only when it differs from the last one", () => {
  let scale = SCALE_100_PERCENT;
  const heard: number[] = [];
  const tracker = createScaleTracker({
    readScale: () => scale,
    onChange: changed => heard.push(changed)
  });
  tracker.check();
  assert.deepEqual(heard, [], "the scale at the start is the known one");

  scale = SCALE_150_PERCENT;
  tracker.check();
  tracker.check();
  assert.deepEqual(heard, [SCALE_150_PERCENT], "one change is heard once");

  scale = SCALE_200_PERCENT;
  tracker.check();
  scale = SCALE_100_PERCENT;
  tracker.check();
  assert.deepEqual(heard, [SCALE_150_PERCENT, SCALE_200_PERCENT, SCALE_100_PERCENT]);
});
