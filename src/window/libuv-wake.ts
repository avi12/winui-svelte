import { createNamedEvent, findLoopCompletionPort } from "./native.ts";
import { createRequire } from "node:module";
import { Worker } from "node:worker_threads";

// What lets the UI thread sleep while libuv has nothing to do. The thread's
// loop is the message pump (message-pump.ts): it blocks in the message wait,
// and the Win32 message wait cannot hear libuv, whose completions (files,
// sockets, worker and port messages, child processes) arrive on its I/O
// completion port. A helper thread therefore waits on that port while the UI
// thread sleeps, and when something arrives it puts the packet back (libuv
// reads it on its next turn) and signals an event the message wait includes.
// Timers are the one thing nobody can ask libuv about from outside: a timer
// Node itself made (a socket timeout) shows in the active resources and keeps
// a short poll; the timers an app makes go through the scheduler, which the
// dispatcher drives.

const AWAKE = 0;
const SLEEPING = 1;
const STOPPED = 2;
const WATCH_MILLISECONDS = 250;
const IDLE_MILLISECONDS = 250;
const TIMER_POLL_MILLISECONDS = 16;
const NO_WAIT_MILLISECONDS = 0;
const IMMEDIATE_RESOURCE = "Immediate";
const TIMER_RESOURCE = "Timeout";
// OVERLAPPED_ENTRY: key, overlapped, internal, bytes transferred.
const ENTRY_BYTES = 32;
const ENTRY_COUNT = 8;
const ENTRY_ALIGNMENT = 8;
const KEY_OFFSET = 0;
const OVERLAPPED_OFFSET = 8;
const BYTES_OFFSET = 24;
const REMOVED_BYTES = 8;
const RESUME_MILLISECONDS = 50;

/**
 * How long the thread may sleep given the resources Node reports active
 * (`process.getActiveResourcesInfo()`).
 */
export function idleMillisecondsFor(resources: readonly string[]) {
  const hasImmediate = resources.includes(IMMEDIATE_RESOURCE);
  if (hasImmediate) {
    return NO_WAIT_MILLISECONDS;
  }

  const hasTimer = resources.includes(TIMER_RESOURCE);
  return hasTimer ? TIMER_POLL_MILLISECONDS : IDLE_MILLISECONDS;
}

interface WatcherData {
  moduleRaw: string;
  moduleUnsafe: string;
  iocp: bigint;
  event: bigint;
  mode: Int32Array;
  states: {
    awake: number;
    sleeping: number;
    stopped: number;
  };
  entries: {
    bytes: number;
    count: number;
    alignment: number;
    keyOffset: number;
    overlappedOffset: number;
    bytesOffset: number;
    removedBytes: number;
  };
  watchMilliseconds: number;
  resumeMilliseconds: number;
}

// Runs in a worker of its own, so it is stringified: it may use nothing
// outside its body.
function watchCompletionPort(data: WatcherData) {
  const load = process.getBuiltinModule("node:module").createRequire(data.moduleRaw);
  const { DynComRawMemory: memoryType } = load(data.moduleRaw);
  const { DynWin32: win32, DynWin32Unsafe: unsafe } = load(data.moduleUnsafe);
  function input(type: string) {
    return {
      type,
      direction: "in",
      nullable: type === "pointer"
    };
  }

  function call({ entryPoint, parameters }: {
    entryPoint: string;
    parameters: string[];
  }) {
    return unsafe.bind({
      dll: "kernel32.dll",
      entryPoint,
      parameters: parameters.map(input),
      returnType: "i32"
    });
  }

  const getStatus = call({
    entryPoint: "GetQueuedCompletionStatusEx",
    parameters: ["pointer", "pointer", "u32", "pointer", "u32", "i32"]
  });
  const post = call({
    entryPoint: "PostQueuedCompletionStatus",
    parameters: ["pointer", "u32", "u64", "pointer"]
  });
  const signal = call({
    entryPoint: "SetEvent",
    parameters: ["pointer"]
  });
  const { bytes, count, alignment, keyOffset, overlappedOffset, bytesOffset, removedBytes } = data.entries;
  const entries = memoryType.allocate(bytes * count, alignment);
  const removed = memoryType.allocate(removedBytes, alignment);
  const port = unsafe.pointer(data.iocp);
  const event = unsafe.pointer(data.event);
  const entriesPointer = unsafe.pointer(entries.pointer().address);
  const removedPointer = unsafe.pointer(removed.pointer().address);
  const maximum = win32.u32(count);
  const timeout = win32.u32(data.watchMilliseconds);
  const notAlertable = win32.i32(0);
  const { awake, sleeping, stopped } = data.states;
  // A wait that fails (the port is closed) returns at once, a timeout takes its time.
  const failedWithin = data.watchMilliseconds / 2;
  while (Atomics.load(data.mode, 0) !== stopped) {
    const isAwake = Atomics.load(data.mode, 0) === awake;
    if (isAwake) {
      Atomics.wait(data.mode, 0, awake);
      continue;
    }

    const started = performance.now();
    getStatus.invoke([port, entriesPointer, maximum, removedPointer, timeout, notAlertable]);
    const received = removed.readU32(0);
    const isTimeout = received === 0;
    if (isTimeout) {
      const hasFailed = performance.now() - started < failedWithin;
      if (hasFailed) {
        return;
      }

      continue;
    }

    for (let i = 0; i < received; i += 1) {
      const base = i * bytes;
      post.invoke([
        port,
        win32.u32(entries.readU32(base + bytesOffset)),
        win32.u64(entries.readU64(base + keyOffset)),
        unsafe.pointer(entries.readU64(base + overlappedOffset))
      ]);
    }

    signal.invoke([event]);
    Atomics.wait(data.mode, 0, sleeping, data.resumeMilliseconds);
  }
}

const WATCHER_SOURCE = `(${watchCompletionPort.toString()})(require("node:worker_threads").workerData)`;

/** What `createMessageSource` sleeps with. */
export interface LibuvWake {
  /** The event handle the message wait includes; signalled when libuv has work. */
  readonly event: bigint;

  /** How long the thread may sleep now. */
  idleMilliseconds(): number;

  /** The thread is about to sleep: start listening for libuv. */
  arm(): void;

  /** The thread is awake again. */
  disarm(): void;

  /** Ends the listening; the event lives as long as the process. */
  stop(): void;
}

/**
 * Starts listening to this thread's libuv loop from a helper thread; undefined
 * when the loop's completion port cannot be found (then the thread polls).
 */
export function startLibuvWake() {
  const iocp = findLoopCompletionPort();
  const isMissing = iocp === undefined;
  if (isMissing) {
    return undefined;
  }

  const event = createNamedEvent({
    name: null,
    isSet: false,
    isAutoReset: true
  });
  const mode = new Int32Array(new SharedArrayBuffer(Int32Array.BYTES_PER_ELEMENT));
  const resolve = createRequire(import.meta.url).resolve;
  const data: WatcherData = {
    moduleRaw: resolve("@microsoft/dynwinrt/com/unsafe/raw"),
    moduleUnsafe: resolve("@microsoft/dynwinrt/win32/unsafe"),
    iocp,
    event,
    mode,
    states: {
      awake: AWAKE,
      sleeping: SLEEPING,
      stopped: STOPPED
    },
    entries: {
      bytes: ENTRY_BYTES,
      count: ENTRY_COUNT,
      alignment: ENTRY_ALIGNMENT,
      keyOffset: KEY_OFFSET,
      overlappedOffset: OVERLAPPED_OFFSET,
      bytesOffset: BYTES_OFFSET,
      removedBytes: REMOVED_BYTES
    },
    watchMilliseconds: WATCH_MILLISECONDS,
    resumeMilliseconds: RESUME_MILLISECONDS
  };
  const worker = new Worker(WATCHER_SOURCE, {
    eval: true,
    workerData: data
  });
  worker.unref();
  return {
    event,
    idleMilliseconds: () => idleMillisecondsFor(process.getActiveResourcesInfo()),
    arm() {
      Atomics.store(mode, 0, SLEEPING);
      Atomics.notify(mode, 0);
    },
    disarm() {
      Atomics.store(mode, 0, AWAKE);
      Atomics.notify(mode, 0);
    },
    stop() {
      Atomics.store(mode, 0, STOPPED);
      Atomics.notify(mode, 0);
    }
  } satisfies LibuvWake;
}
