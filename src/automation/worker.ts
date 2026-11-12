import { UiaTimeout } from "./client.ts";
import type { WindowText } from "./text.ts";
import type { UiaTargetSpec, UiaWorkerRequest, UiaWorkerResponse } from "./worker-job.ts";
import { Worker } from "node:worker_threads";

const DEFAULT_HARD_MILLISECONDS = 1500;

/** The part of a worker the host uses; a test passes a fake. */
export interface UiaWorkerHandle {
  postMessage(request: UiaWorkerRequest): void;
  on(event: "message", listener: (response: UiaWorkerResponse) => void): unknown;
  on(event: "error" | "exit", listener: (error: unknown) => void): unknown;
  terminate(): unknown;
}

/** The request of `UiaWorker.readText`. */
export interface UiaReadRequest {
  readonly target: UiaTargetSpec;

  /** A window of this process is not read. */
  readonly excludeProcessId?: number;
  readonly maxElements?: number;

  /** The soft deadline of the walk; 400 by default. */
  readonly maxMilliseconds?: number;
  readonly maxCharacters?: number;

  /** The hard deadline: the call rejects with `UiaTimeout` and the worker is replaced; 1500 by default. */
  readonly hardMilliseconds?: number;
}

/** A worker thread that owns the UI Automation client. */
export interface UiaWorker {
  /**
   * Reads the text of a window in the worker. A blocked COM call cannot be
   * cancelled, so a call that outlives `hardMilliseconds` rejects with
   * `UiaTimeout`, the worker is ended, and the next call starts a new one.
   */
  readText(request: UiaReadRequest): Promise<WindowText | null>;

  /** Ends the worker. */
  close(): void;
}

function spawnNative() {
  const extension = import.meta.url.endsWith(".ts") ? "ts" : "js";
  const moduleUrl = new URL(`./worker-job.${extension}`, import.meta.url).href;
  const source = `import(${JSON.stringify(moduleUrl)}).then(module => module.runUiaWorker())`;
  return new Worker(source, { eval: true }) as unknown as UiaWorkerHandle;
}

/**
 * Starts a UI Automation worker thread on first use. Its COM apartment is the
 * multithreaded one, which Microsoft advises for a client, and a hung target
 * app costs one call its hard deadline, not the caller's thread.
 *
 * @param options - `spawn`: how to make the worker (a test passes a fake).
 * @returns The worker.
 */
export function createUiaWorker({ spawn = spawnNative }: { readonly spawn?: () => UiaWorkerHandle } = {}) {
  let worker: UiaWorkerHandle | null = null;
  let nextId = 0;

  function discard() {
    void worker?.terminate();
    worker = null;
  }

  const uiaWorker: UiaWorker = {
    readText({ hardMilliseconds = DEFAULT_HARD_MILLISECONDS, ...request }) {
      const current = worker ?? spawn();
      worker = current;
      nextId += 1;
      const id = nextId;
      return new Promise<WindowText | null>((resolve, reject) => {
        const timer = setTimeout(() => {
          discard();
          reject(new UiaTimeout(`the target did not answer in ${hardMilliseconds} ms`));
        }, hardMilliseconds);
        current.on("message", response => {
          const isOurs = response.id === id;
          if (!isOurs) {
            return;
          }

          clearTimeout(timer);

          const isErrorInResponse = "error" in response;
          if (isErrorInResponse) {
            reject(new Error(response.error));
            return;
          }

          resolve(response.text);
        });
        current.on("error", error => {
          clearTimeout(timer);
          discard();
          reject(error instanceof Error ? error : new Error(String(error)));
        });
        current.on("exit", () => {
          clearTimeout(timer);
          worker = null;
          reject(new Error("the UI Automation worker ended"));
        });
        current.postMessage({
          ...request,
          id
        });
      });
    },
    close: discard
  };
  return uiaWorker;
}
