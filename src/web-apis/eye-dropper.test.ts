import assert from "node:assert/strict";
import { test } from "node:test";

// EyeDropper over a stand-in screen picker: the result shape, cancellation,
// abort and the one-open-at-a-time rule. The real picker polls the pointer
// and is only built, never run, by test/eye-dropper.test.ts.

const { EyeDropper, installEyeDropper } = await import("./eye-dropper.ts");

type Picker = NonNullable<Parameters<typeof installEyeDropper>[0]>["picker"];

function controllablePicker() {
  const waiting: Array<{
    resolve: (pixel: Awaited<ReturnType<NonNullable<Picker>["pick"]>>) => void;
    reject: (reason: unknown) => void;
  }> = [];
  const picker = {
    pick({ signal }) {
      return new Promise((resolve, reject) => {
        waiting.push({
          resolve,
          reject
        });
        signal?.addEventListener("abort", () => reject(signal.reason));
      });
    }
  } satisfies NonNullable<Picker>;
  return {
    picker,
    waiting
  };
}

async function nameOf(promise: Promise<unknown>) {
  try {
    await promise;
  } catch (error) {
    assert.ok(error instanceof DOMException);
    return error.name;
  }

  return undefined;
}

test("open resolves with the color as #rrggbb and the pixel's position", async () => {
  const { picker, waiting } = controllablePicker();
  const uninstall = installEyeDropper({ picker });
  try {
    assert.equal("EyeDropper" in globalThis, true);
    const opened = new EyeDropper().open();
    waiting[0]?.resolve({
      x: 10,
      y: 20,
      red: 255,
      green: 0,
      blue: 8
    });
    assert.deepEqual(await opened, {
      sRGBHex: "#ff0008",
      position: {
        x: 10,
        y: 20
      }
    });
  } finally {
    uninstall();
  }

  assert.equal("EyeDropper" in globalThis, false);
});

test("the user cancelling rejects with AbortError, and the dropper can open again", async () => {
  const { picker, waiting } = controllablePicker();
  const uninstall = installEyeDropper({ picker });
  try {
    const dropper = new EyeDropper();
    const cancelled = nameOf(dropper.open());
    waiting[0]?.resolve(undefined);
    assert.equal(await cancelled, "AbortError");

    const again = dropper.open();
    waiting[1]?.resolve({
      x: 0,
      y: 0,
      red: 0,
      green: 0,
      blue: 0
    });
    assert.equal((await again).sRGBHex, "#000000");
  } finally {
    uninstall();
  }
});

test("a second open while one waits is an InvalidStateError", async () => {
  const { picker, waiting } = controllablePicker();
  const uninstall = installEyeDropper({ picker });
  try {
    const first = nameOf(new EyeDropper().open());
    assert.equal(await nameOf(new EyeDropper().open()), "InvalidStateError");
    waiting[0]?.resolve(undefined);
    assert.equal(await first, "AbortError");
  } finally {
    uninstall();
  }
});

test("a signal that aborts, before or during the wait, rejects with its reason", async () => {
  const { picker, waiting } = controllablePicker();
  const uninstall = installEyeDropper({ picker });
  try {
    const controller = new AbortController();
    const during = nameOf(new EyeDropper().open({ signal: controller.signal }));
    controller.abort();
    assert.equal(await during, "AbortError");

    const aborted = new AbortController();
    aborted.abort();
    assert.equal(await nameOf(new EyeDropper().open({ signal: aborted.signal })), "AbortError");
    assert.equal(waiting.length, 1);
  } finally {
    uninstall();
  }
});

test("open before install is an InvalidStateError", async () => {
  assert.equal(await nameOf(new EyeDropper().open()), "InvalidStateError");
});
