import assert from "node:assert/strict";
import { test } from "node:test";

const { RuntimeUpdates, UpdateCheckStatus } = await import("./updates.ts");

const CURRENT = "1.0.0";

function feedFetch() {
  return Promise.resolve(
    Response.json({
      releases: [{
        version: CURRENT,
        file: "app-1.0.0.zip",
        sha256: "00",
        size: 1
      }]
    })
  );
}

test("answers no_update without a source", async () => {
  const updates = new RuntimeUpdates({
    source: undefined,
    currentVersion: CURRENT
  });
  assert.equal((await updates.requestUpdateCheck()).status, UpdateCheckStatus.NO_UPDATE);
  assert.equal(updates.startStaged(), false);
});

test("answers no_update when current, then throttled", async () => {
  const updates = new RuntimeUpdates({
    source: {
      root: "unused",
      feedUrl: "http://host/releases.json",
      executable: "app.exe",
      fetch: feedFetch
    },
    currentVersion: CURRENT
  });
  assert.equal((await updates.requestUpdateCheck()).status, UpdateCheckStatus.NO_UPDATE);
  assert.equal((await updates.requestUpdateCheck()).status, UpdateCheckStatus.THROTTLED);
});
