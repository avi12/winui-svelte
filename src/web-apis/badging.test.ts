import assert from "node:assert/strict";
import { test } from "node:test";

// navigator.setAppBadge over a stand-in for BadgeNotificationManager.

const { installBadging } = await import("./badging.ts");

function fakeBackend({ isFailing = false } = {}) {
  const calls: string[] = [];
  function fail() {
    if (isFailing) {
      throw new Error("no identity");
    }
  }

  return {
    calls,
    backend: {
      setCount(count: number) {
        fail();
        calls.push(`count ${count}`);
      },
      setGlyph(glyph: string) {
        fail();
        calls.push(`glyph ${glyph}`);
      },
      clear() {
        fail();
        calls.push("clear");
      }
    }
  };
}

test("a count, no argument, zero and clear map to the badge", async () => {
  const fake = fakeBackend();
  const uninstall = installBadging({ backend: fake.backend });
  try {
    await navigator.setAppBadge(3);
    await navigator.setAppBadge();
    await navigator.setAppBadge(0);
    await navigator.clearAppBadge();
    await navigator.setAppBadgeGlyph("busy");
    assert.deepEqual(fake.calls, ["count 3", "glyph attention", "clear", "clear", "glyph busy"]);
  } finally {
    uninstall();
  }
});

test("a bad count is a TypeError and a refusing Windows is NotSupportedError", async () => {
  const uninstall = installBadging({ backend: fakeBackend().backend });
  try {
    await assert.rejects(navigator.setAppBadge(-1), TypeError);
    await assert.rejects(navigator.setAppBadge(1.5), TypeError);
    // oxlint-disable-next-line typescript/consistent-type-assertions -- proves a value outside the type is refused
    await assert.rejects(navigator.setAppBadgeGlyph("nope" as never), TypeError);
  } finally {
    uninstall();
  }

  const uninstallRefusing = installBadging({ backend: fakeBackend({ isFailing: true }).backend });
  try {
    await assert.rejects(navigator.setAppBadge(2), { name: "NotSupportedError" });
  } finally {
    uninstallRefusing();
  }
});

test("uninstall takes the members away", () => {
  const uninstall = installBadging({ backend: fakeBackend().backend });
  uninstall();
  assert.equal("setAppBadge" in navigator, false);
});

test("a refusing Windows draws the badge through the fallback", async () => {
  const refusing = fakeBackend({ isFailing: true });
  const spare = fakeBackend();
  const uninstall = installBadging({
    backend: refusing.backend,
    fallback: spare.backend
  });
  try {
    await navigator.setAppBadge(2);
    await navigator.setAppBadgeGlyph("busy");
    await navigator.clearAppBadge();
    assert.deepEqual(spare.calls, ["count 2", "glyph busy", "clear"]);
  } finally {
    uninstall();
  }
});
