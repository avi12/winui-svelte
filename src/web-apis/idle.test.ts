import assert from "node:assert/strict";
import { test } from "node:test";

// The web IdleDetector over a stand-in for the Win32 calls: permission, the
// threshold, state changes and the abort signal. The real readings are for
// test/web-apis-hardware.test.ts.

const { IdleDetector, installIdleDetector } = await import("./idle.ts");
const { installPermissions, Permissions } = await import("./permissions.ts");

function fakeBackend() {
  let reading = {
    idleMilliseconds: 0,
    isLocked: false
  };
  let tick: (() => void) | undefined;
  return {
    backend: {
      read: () => reading,
      observe(onTick: () => void) {
        tick = onTick;
        return () => {
          tick = undefined;
        };
      }
    },
    set(next: typeof reading) {
      reading = next;
      tick?.();
    },
    get isObserving() {
      return tick !== undefined;
    }
  };
}

test("start needs permission, which requestPermission grants", async () => {
  const fake = fakeBackend();
  const uninstall = installIdleDetector({ backend: fake.backend });
  const detector = new IdleDetector();
  await assert.rejects(detector.start(), error => error instanceof DOMException && error.name === "NotAllowedError");
  assert.equal(await IdleDetector.requestPermission(), "granted");
  await detector.start();
  assert.equal(detector.userState, "active");
  assert.equal(detector.screenState, "unlocked");
  uninstall();
});

test("a refused permission stays refused", async () => {
  const uninstall = installIdleDetector({
    backend: fakeBackend().backend,
    permission: "denied"
  });
  assert.equal(await IdleDetector.requestPermission(), "denied");
  await assert.rejects(new IdleDetector().start(), error => error instanceof DOMException && error.name === "NotAllowedError");
  uninstall();
});

test("a threshold under a minute is a TypeError", async () => {
  const uninstall = installIdleDetector({ backend: fakeBackend().backend });
  await IdleDetector.requestPermission();
  await assert.rejects(new IdleDetector().start({ threshold: 59_999 }), TypeError);
  await assert.rejects(new IdleDetector().start({ threshold: Number.NaN }), TypeError);
  uninstall();
});

test("change fires when the user goes idle and when the screen locks, not otherwise", async () => {
  const fake = fakeBackend();
  const uninstall = installIdleDetector({ backend: fake.backend });
  await IdleDetector.requestPermission();
  const detector = new IdleDetector();
  await detector.start({ threshold: 60_000 });
  const seen: string[] = [];
  detector.onchange = () => seen.push(`${detector.userState}/${detector.screenState}`);
  fake.set({
    idleMilliseconds: 30_000,
    isLocked: false
  });
  fake.set({
    idleMilliseconds: 61_000,
    isLocked: false
  });
  fake.set({
    idleMilliseconds: 62_000,
    isLocked: true
  });
  assert.deepEqual(seen, ["idle/unlocked", "idle/locked"]);
  assert.equal(detector.idleMilliseconds, 62_000);
  uninstall();
});

test("aborting stops the watching, and an aborted signal rejects start", async () => {
  const fake = fakeBackend();
  const uninstall = installIdleDetector({ backend: fake.backend });
  await IdleDetector.requestPermission();
  const controller = new AbortController();
  await new IdleDetector().start({ signal: controller.signal });
  assert.equal(fake.isObserving, true);
  controller.abort();
  assert.equal(fake.isObserving, false);
  await assert.rejects(new IdleDetector().start({ signal: controller.signal }), error => error instanceof DOMException && error.name === "AbortError");
  uninstall();
});

test("the Permissions API follows the request", async () => {
  const uninstallPermissions = installPermissions();
  const uninstall = installIdleDetector({ backend: fakeBackend().backend });
  const status = await new Permissions().query({ name: "idle-detection" });
  assert.equal(status.state, "prompt");
  const changes: string[] = [];
  status.addEventListener("change", () => changes.push(status.state));
  await IdleDetector.requestPermission();
  assert.deepEqual(changes, ["granted"]);
  uninstall();
  uninstallPermissions();
});
