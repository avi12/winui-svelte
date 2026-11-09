import { bindDll } from "#src/win32-calls.js";

// The process's DPI awareness, apart from the window runtime: it imports no
// WinRT, so it runs on a host's main thread before anything else. Bound when
// called, never when the module loads.

/** How a process is told the pixels of a display: from not at all to per monitor. */
export const DpiAwareness = {
  unaware: "unaware",
  system: "system",
  perMonitor: "per-monitor",
  perMonitorV2: "per-monitor-v2"
} as const;

/** One of the `DpiAwareness` values. */
export type DpiAwareness = (typeof DpiAwareness)[keyof typeof DpiAwareness];

/** From the lowest awareness to the highest: a later one satisfies an earlier request. */
const AWARENESS_ORDER = [
  DpiAwareness.unaware,
  DpiAwareness.system,
  DpiAwareness.perMonitor,
  DpiAwareness.perMonitorV2
] as const;

/** The pseudo handles of `DPI_AWARENESS_CONTEXT`, signed as Windows defines them; the one table. */
export const DPI_CONTEXT_HANDLES = {
  [DpiAwareness.unaware]: -1n,
  [DpiAwareness.system]: -2n,
  [DpiAwareness.perMonitor]: -3n,
  [DpiAwareness.perMonitorV2]: -4n
} as const;

const UNAWARE_GDI_SCALED_HANDLE = -5n;
const POINTER_BITS = 64;

/**
 * The awareness a pseudo handle stands for.
 *
 * @param handle - A `DPI_AWARENESS_CONTEXT` pseudo handle, signed or as a 64-bit address.
 * @returns The awareness; undefined for a handle that is not one of the pseudo values.
 */
export function awarenessOfHandle(handle: bigint) {
  const signed = BigInt.asIntN(POINTER_BITS, handle);
  const isGdiScaled = signed === UNAWARE_GDI_SCALED_HANDLE;
  if (isGdiScaled) {
    return DpiAwareness.unaware;
  }

  return AWARENESS_ORDER.find(awareness => DPI_CONTEXT_HANDLES[awareness] === signed);
}

/**
 * The awareness the process asked for was refused and what it has is lower;
 * a manifest or an earlier call set it, or a window already exists.
 */
export class DpiAwarenessTooLow extends Error {
  /** What the process asked for. */
  readonly requested: DpiAwareness;

  /** What the process has. */
  readonly current: DpiAwareness;

  constructor({ requested, current }: {
    readonly requested: DpiAwareness;
    readonly current: DpiAwareness;
  }) {
    super(`The process is ${current} DPI aware and cannot become ${requested}: set the awareness before the first window exists, or in the application manifest`);
    this.requested = requested;
    this.current = current;
  }
}

/** The two native steps `ensureDpiAwareness` takes, so a test can stand in for them. */
export interface DpiAwarenessCalls {
  /** Asks Windows to make the process this aware; true when it did. */
  readonly setProcess: (awareness: DpiAwareness) => boolean;

  /** What the process is now. */
  readonly current: () => DpiAwareness;
}

function rankOf(awareness: DpiAwareness) {
  return AWARENESS_ORDER.indexOf(awareness);
}

/**
 * Asks for an awareness; refusal is success when the process already has at
 * least that (a manifest or an earlier call set it).
 *
 * @param options - `requested`, and the native `calls`.
 * @throws {DpiAwarenessTooLow} when refused and the process has less
 */
export function ensureDpiAwareness({ requested, calls }: {
  readonly requested: DpiAwareness;
  readonly calls: DpiAwarenessCalls;
}) {
  const isSet = calls.setProcess(requested);
  if (isSet) {
    return;
  }

  const current = calls.current();
  const isSufficient = rankOf(current) >= rankOf(requested);
  if (!isSufficient) {
    throw new DpiAwarenessTooLow({
      requested,
      current
    });
  }
}

function bindUser32() {
  return bindDll({
    dll: "user32.dll",
    functions: {
      setProcess: ["SetProcessDpiAwarenessContext", ["pointer"], "i32"],
      thread: ["GetThreadDpiAwarenessContext", [], "pointer"],
      areEqual: ["AreDpiAwarenessContextsEqual", ["pointer", "pointer"], "i32"]
    }
  });
}

function handleArgument(awareness: DpiAwareness) {
  return BigInt.asUintN(POINTER_BITS, DPI_CONTEXT_HANDLES[awareness]);
}

/**
 * What this process is now, from `GetThreadDpiAwarenessContext`.
 *
 * @returns The awareness; `unaware` for the GDI-scaled flavour of it.
 */
export function processDpiAwareness() {
  const user32 = bindUser32();
  const context = user32.thread();
  function isEqual(awareness: DpiAwareness) {
    return user32.areEqual(context, handleArgument(awareness)) !== 0;
  }

  return [...AWARENESS_ORDER].reverse().find(isEqual) ?? DpiAwareness.unaware;
}

/**
 * Asks Windows for a process-wide awareness. Call it on the main thread
 * before any window exists: user32 allows it once, and a library that created
 * a window first keeps an unaware process.
 *
 * @param requested - The awareness to ask for.
 * @throws {DpiAwarenessTooLow} when refused and the process has less
 */
export function requestDpiAwareness(requested: DpiAwareness) {
  const user32 = bindUser32();
  ensureDpiAwareness({
    requested,
    calls: {
      setProcess(awareness) {
        return user32.setProcess(handleArgument(awareness)) !== 0;
      },
      current: processDpiAwareness
    }
  });
}
