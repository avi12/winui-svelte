import {
  awarenessOfHandle,
  DPI_CONTEXT_HANDLES,
  DpiAwareness,
  DpiAwarenessTooLow,
  ensureDpiAwareness
} from "./dpi-awareness.ts";
import assert from "node:assert/strict";
import { test } from "node:test";

const UNAWARE_GDI_SCALED = -5n;
const UNSIGNED_BITS = 64;

test("every pseudo handle maps to its awareness and back", () => {
  for (const awareness of Object.values(DpiAwareness)) {
    const handle = DPI_CONTEXT_HANDLES[awareness];
    assert.equal(awarenessOfHandle(handle), awareness);
    assert.equal(awarenessOfHandle(BigInt.asUintN(UNSIGNED_BITS, handle)), awareness, "as an address");
  }

  assert.equal(awarenessOfHandle(UNAWARE_GDI_SCALED), DpiAwareness.unaware);
  assert.equal(awarenessOfHandle(0n), undefined);
});

test("a granted request needs no second look", () => {
  const asked: DpiAwareness[] = [];
  ensureDpiAwareness({
    requested: DpiAwareness.perMonitorV2,
    calls: {
      setProcess(awareness) {
        asked.push(awareness);
        return true;
      },
      current: () => assert.fail("not read when granted")
    }
  });
  assert.deepEqual(asked, [DpiAwareness.perMonitorV2]);
});

test("a refusal is success when the process already has enough", () => {
  ensureDpiAwareness({
    requested: DpiAwareness.perMonitor,
    calls: {
      setProcess: () => false,
      current: () => DpiAwareness.perMonitorV2
    }
  });
});

test("a refusal below the request throws naming both values", () => {
  function attempt() {
    ensureDpiAwareness({
      requested: DpiAwareness.perMonitorV2,
      calls: {
        setProcess: () => false,
        current: () => DpiAwareness.unaware
      }
    });
  }

  assert.throws(attempt, error => {
    assert.ok(error instanceof DpiAwarenessTooLow);
    assert.equal(error.requested, DpiAwareness.perMonitorV2);
    assert.equal(error.current, DpiAwareness.unaware);
    assert.match(error.message, /unaware.*per-monitor-v2/);
    return true;
  });
});
