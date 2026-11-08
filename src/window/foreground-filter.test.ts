import assert from "node:assert/strict";
import { test } from "node:test";

const { createForegroundTracker, ForegroundShellClass, shouldRestore } = await import("./foreground-filter.ts");

const OWN_PROCESS = 10;
const APP = 100n;
const OTHER_APP = 101n;
const OWN = 102n;
const SIBLING = 103n;
const SHELL = 104n;

function createFake() {
  const classes = new Map<bigint, string>([[SHELL, ForegroundShellClass.taskbar]]);
  const processes = new Map<bigint, number>([[OWN, OWN_PROCESS]]);
  const gone = new Set<bigint>();
  const reads: bigint[] = [];
  const fake = {
    front: 0n,
    reads,
    gone,
    source: {
      foreground: () => fake.front,
      classOf(hwnd: bigint) {
        reads.push(hwnd);
        return classes.get(hwnd) ?? "Chrome_WidgetWin_1";
      },
      processOf: (hwnd: bigint) => processes.get(hwnd) ?? 1,
      isWindow: (hwnd: bigint) => !gone.has(hwnd)
    }
  };
  return fake;
}

function create(options: { ownWindows?: () => readonly bigint[] } = {}) {
  const fake = createFake();
  const changes: Array<{
    hwnd: bigint | null;
    isRealApp: boolean;
  }> = [];
  const tracker = createForegroundTracker({
    source: fake.source,
    ownProcessId: OWN_PROCESS,
    ownWindows: options.ownWindows,
    onChanged: change => changes.push(change)
  });
  return {
    fake,
    tracker,
    changes
  };
}

test("the shell classes are skipped and keep the last real app", () => {
  const { fake, tracker } = create();
  fake.front = APP;
  tracker.check();
  fake.front = SHELL;
  tracker.check();
  assert.equal(tracker.current, SHELL);
  assert.equal(tracker.lastRealApp, APP);
  assert.equal(tracker.foreground.isRealApp, false);
});

test("a window of this process and a listed window are skipped", () => {
  const { fake, tracker } = create({ ownWindows: () => [SIBLING] });
  fake.front = APP;
  tracker.check();
  fake.front = OWN;
  tracker.check();
  assert.equal(tracker.lastRealApp, APP);
  fake.front = SIBLING;
  tracker.check();
  assert.equal(tracker.lastRealApp, APP);
  fake.front = OTHER_APP;
  tracker.check();
  assert.equal(tracker.lastRealApp, OTHER_APP);
});

test("onChanged fires once per change and not on a repeat or at the start", () => {
  const { fake, tracker, changes } = create();
  fake.front = APP;
  tracker.check();
  tracker.check();
  fake.front = 0n;
  tracker.check();
  assert.deepEqual(changes, [
    {
      hwnd: APP,
      isRealApp: true
    },
    {
      hwnd: null,
      isRealApp: false
    }
  ]);
});

test("a window is classified once, and forgotten when it is gone", () => {
  const { fake, tracker } = create();
  fake.front = APP;
  tracker.check();
  fake.front = OTHER_APP;
  tracker.check();
  fake.front = APP;
  tracker.check();
  assert.deepEqual(fake.reads, [APP, OTHER_APP]);
  fake.gone.add(APP);
  fake.front = OTHER_APP;
  tracker.check();
  fake.gone.delete(APP);
  fake.front = APP;
  tracker.check();
  assert.deepEqual(fake.reads, [APP, OTHER_APP, APP]);
});

test("shouldRestore brings the app back only from a non-app", () => {
  const shell = {
    hwnd: SHELL,
    isRealApp: false
  };
  const app = {
    hwnd: OTHER_APP,
    isRealApp: true
  };
  assert.equal(
    shouldRestore({
      lastRealApp: APP,
      foreground: shell
    }), true
  );
  assert.equal(
    shouldRestore({
      lastRealApp: APP,
      foreground: app
    }), false
  );
  assert.equal(
    shouldRestore({
      lastRealApp: null,
      foreground: shell
    }), false
  );
});
