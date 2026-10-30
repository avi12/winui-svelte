import { MAX_REDIRECT_BYTES } from "./redirect.ts";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import type { Socket } from "node:net";
import path from "node:path";
import { MessageChannel, receiveMessageOnPort, Worker } from "node:worker_threads";
import type { MessagePort } from "node:worker_threads";

// The single-instance link: a named pipe per key and user, served from a
// worker thread. The UI thread's own Node loop never turns (WinUI holds it),
// so a pipe opened there would never accept; the worker's loop is free. The
// UI thread waits on shared memory for the one answer (am I first?), then
// drains the worker's port on a timer of its own.

const PIPE_PREFIX = "\\\\.\\pipe\\winui-svelte-";
const HASH_LENGTH = 32;
const SID_PATTERN = /S-1-[\d-]+/u;
const CLAIM_TIMEOUT_MILLISECONDS = 10_000;
const CONNECT_ATTEMPTS = 3;
const IDLE_MILLISECONDS = 5000;

const Status = {
  PENDING: 0,
  PRIMARY: 1,
  HANDED_OVER: 2,
  FAILED: 3
} as const;

interface PipeWorkerData {
  readonly pipeName: string;
  readonly payload: string;
  readonly maxBytes: number;
  readonly attempts: number;
  readonly idleMilliseconds: number;
  readonly statuses: typeof Status;
  readonly status: Int32Array;
  readonly port: MessagePort;
}

/**
 * Where a key's pipe is, for one user: the name holds a hash of both, so
 * another user's copy of the same app is another pipe.
 *
 * @param options - The app's key and the user's SID.
 * @returns The pipe's path.
 */
export function pipeNameFor({ key, sid }: {
  key: string;
  sid: string;
}) {
  const hash = createHash("sha256").update(`${sid}\0${key}`).digest("hex");
  return `${PIPE_PREFIX}${hash.slice(0, HASH_LENGTH)}`;
}

/**
 * The SID of the user this process runs as, from the system's own `whoami`
 * (found by `SystemRoot`, never by `PATH`).
 *
 * @returns The SID, such as `S-1-5-21-...`.
 * @throws {Error} When `whoami` gives none.
 */
export function currentUserSid() {
  const root = process.env["SystemRoot"] ?? "C:\\Windows";
  const output = execFileSync(path.join(root, "System32", "whoami.exe"), ["/user", "/fo", "csv", "/nh"], {
    encoding: "utf8",
    windowsHide: true
  });
  const sid = SID_PATTERN.exec(output)?.[0];
  const isSidMissing = sid === undefined;
  if (isSidMissing) {
    throw new Error("could not read the current user's SID");
  }

  return sid;
}

// Runs in the worker: it is sent as source text, so it holds no reference to
// this module. It serves the pipe, or hands the payload to whoever does.
function runPipeWorker() {
  const { workerData } = process.getBuiltinModule("node:worker_threads");
  const net = process.getBuiltinModule("node:net");
  const data: PipeWorkerData = workerData;
  const { status, port, statuses } = data;

  function finish(code: number) {
    Atomics.store(status, 0, code);
    Atomics.notify(status, 0);
  }

  function fail(error: Error) {
    port.postMessage({ error: error.message });
    finish(statuses.FAILED);
  }

  function readLine({ socket, line }: {
    socket: Socket;
    line: string;
  }) {
    try {
      port.postMessage({ value: JSON.parse(line) });
    } catch {
      // A line that is not JSON is dropped
    }
    socket.end();
  }

  function serve(socket: Socket) {
    let received = "";
    socket.setEncoding("utf8");
    socket.setTimeout(data.idleMilliseconds, () => socket.destroy());
    socket.on("error", () => socket.destroy());
    socket.on("data", (chunk: string) => {
      received += chunk;
      const iNewline = received.indexOf("\n");
      const isComplete = iNewline >= 0;
      const isTooLarge = socket.bytesRead > data.maxBytes;
      if (isTooLarge) {
        socket.destroy();
      } else if (isComplete) {
        readLine({
          socket,
          line: received.slice(0, iNewline)
        });
      }
    });
  }

  function handOver(attemptsLeft: number) {
    const socket = net.connect(data.pipeName);
    socket.on("connect", () => {
      socket.end(`${data.payload}\n`);
    });
    socket.on("close", isErrored => {
      if (!isErrored) {
        finish(statuses.HANDED_OVER);
      }
    });
    socket.on("error", error => {
      const isLastAttempt = attemptsLeft <= 1;
      if (isLastAttempt) {
        fail(error);
        return;
      }

      listen(attemptsLeft - 1);
    });
  }

  function listen(attemptsLeft: number) {
    const server = net.createServer(serve);
    server.once("error", error => {
      const isInUse = "code" in error && error.code === "EADDRINUSE";
      if (isInUse) {
        handOver(attemptsLeft);
        return;
      }

      fail(error);
    });
    server.listen(data.pipeName, () => finish(statuses.PRIMARY));
  }

  listen(data.attempts);
}

const WORKER_SOURCE = `(${runPipeWorker.toString()})()`;

/** The first copy's end of the link: what arrives, and how to close it. */
export interface PipeServer {
  readonly isPrimary: true;
  readonly port: MessagePort;
  close(): void;
}

/** A later copy's end: its payload was delivered. */
export interface PipeHandedOver {
  readonly isPrimary: false;
}

/**
 * Serves the key's pipe if no one does (this process is the first copy), or
 * delivers `payload` to whoever does. Blocks the calling thread for the few
 * milliseconds the worker needs to find out.
 *
 * @param options - The pipe's path and the line a later copy sends.
 * @returns The server's end, or that the payload was handed over.
 * @throws {Error} When the pipe can neither be served nor reached.
 */
export function openPipe({ pipeName, payload }: {
  pipeName: string;
  payload: string;
}) {
  const status = new Int32Array(new SharedArrayBuffer(Int32Array.BYTES_PER_ELEMENT));
  const { port1, port2 } = new MessageChannel();
  const workerData: PipeWorkerData = {
    pipeName,
    payload,
    maxBytes: MAX_REDIRECT_BYTES,
    attempts: CONNECT_ATTEMPTS,
    idleMilliseconds: IDLE_MILLISECONDS,
    statuses: Status,
    status,
    port: port2
  };
  const worker = new Worker(WORKER_SOURCE, {
    eval: true,
    workerData,
    transferList: [port2]
  });
  worker.unref();
  port1.unref();
  Atomics.wait(status, 0, Status.PENDING, CLAIM_TIMEOUT_MILLISECONDS);
  const result = Atomics.load(status, 0);
  const isPrimary = result === Status.PRIMARY;
  if (isPrimary) {
    return {
      isPrimary: true,
      port: port1,
      close() {
        void worker.terminate();
        port1.close();
      }
    } satisfies PipeServer;
  }

  const reason = receiveMessageOnPort(port1)?.message;
  void worker.terminate();
  port1.close();

  const isHandedOver = result === Status.HANDED_OVER;
  if (isHandedOver) {
    return { isPrimary: false } satisfies PipeHandedOver;
  }

  throw new Error(`the single-instance pipe failed: ${JSON.stringify(reason) ?? "no answer in time"}`);
}
