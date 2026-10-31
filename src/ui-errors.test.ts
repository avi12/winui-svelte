import { guarded, onUiError, reportUiError } from "./ui-errors.ts";
import type { UiErrorReport } from "./ui-errors.ts";
import assert from "node:assert/strict";
import { test } from "node:test";

// What reaches stderr is written through console.error; the tests swap it for
// a list so the run stays quiet.
function captured(action: () => void) {
  const original = console.error;
  const written: string[] = [];
  console.error = (...parts: unknown[]) => {
    written.push(parts.map(String).join(" "));
  };
  try {
    action();
  } finally {
    console.error = original;
  }

  return written;
}

test("a reported error is written with its origin and stack", () => {
  const written = captured(() => {
    reportUiError({
      error: new Error("broken"),
      origin: "onStart"
    });
  });
  assert.equal(written.length, 1);
  assert.match(written[0] ?? "", /^\[winui-svelte\] onStart: Error: broken\n\s+at /u);
});

test("a thrown value that is no Error is still written", () => {
  const written = captured(() => {
    reportUiError({
      error: "text",
      origin: "event \"onclick\""
    });
  });
  assert.match(written[0] ?? "", /event "onclick": Uncaught text/u);
});

test("listeners are told, and one that throws does not stop the others", () => {
  const heard: UiErrorReport[] = [];
  const stopThrowing = onUiError(() => {
    throw new Error("listener failed");
  });
  const stopHearing = onUiError(report => heard.push(report));
  const written = captured(() => {
    reportUiError({
      error: "x",
      origin: "o"
    });
  });
  stopThrowing();
  stopHearing();
  assert.equal(heard.length, 1);
  assert.equal(heard[0]?.origin, "o");
  assert.ok(written.some(line => line.includes("listener failed")));
});

test("a stopped listener is not told", () => {
  const heard: UiErrorReport[] = [];
  const stop = onUiError(report => heard.push(report));
  stop();
  captured(() => {
    reportUiError({
      error: "x",
      origin: "o"
    });
  });
  assert.deepEqual(heard, []);
});

test("a guarded callback passes its arguments and result, and reports what it throws", () => {
  const add = guarded({
    origin: "add",
    callback: (left: number, right: number) => left + right
  });
  assert.equal(add(1, 2), 3);
  const fails = guarded({
    origin: "fails",
    callback() {
      throw new Error("no");
    }
  });
  const written = captured(() => {
    assert.equal(fails(), undefined);
  });
  assert.match(written[0] ?? "", /fails: Error: no/u);
});

test("a guarded callback reports the rejection of the promise it returns", async () => {
  const later = guarded({
    origin: "later",
    callback: () => Promise.reject(new Error("rejected"))
  });
  const original = console.error;
  const written: string[] = [];
  console.error = (...parts: unknown[]) => {
    written.push(parts.map(String).join(" "));
  };
  try {
    later().catch(() => undefined);
    await new Promise(resolve => setImmediate(resolve));
  } finally {
    console.error = original;
  }

  assert.match(written[0] ?? "", /later: Error: rejected/u);
});
