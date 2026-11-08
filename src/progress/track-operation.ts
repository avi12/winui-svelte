import { ProgressOperation } from "./progress-operation.ts";
import type { ProgressOperationOptions } from "./progress-operation.ts";

const ABORT_ERROR = "AbortError";

/** What `trackOperation` takes: the operation options and the work. */
export interface TrackOperationOptions<Result> extends ProgressOperationOptions {
  /** The work; report with `operation.update`, stop when `operation.signal` aborts. */
  readonly run: (operation: ProgressOperation<Result>) => Promise<Result>;
}

/** The part of an operation that the work reports through. */
export interface ProgressReporter {
  readonly signal: AbortSignal;
  update(options: {
    loaded: number;
    total?: number | undefined;
  }): void;
}

function isAbortError(error: unknown) {
  return error instanceof DOMException && error.name === ABORT_ERROR;
}

async function execute<Result>({ operation, run }: {
  operation: ProgressOperation<Result>;
  run: TrackOperationOptions<Result>["run"];
}) {
  try {
    operation.complete(await run(operation));
  } catch (error) {
    const isCancel = isAbortError(error);
    if (isCancel) {
      operation.cancel(error);
      return;
    }

    operation.fail(error);
  }
}

/**
 * Runs `run` as a tracked operation: it starts at once, completes with what
 * `run` returns, fails with what it throws and is canceled when it throws an
 * `AbortError`. This is the whole lifecycle for any long work (a copy, an OCR
 * pass, a decode), so an app wires it in one call.
 *
 * @param options - The work and the operation options.
 * @returns The operation: await it for the result, bind it to a bar, cancel it.
 */
export function trackOperation<Result>({ run, ...options }: TrackOperationOptions<Result>) {
  const operation = new ProgressOperation<Result>(options);
  operation.start();
  void execute({
    operation,
    run
  });
  return operation;
}

/**
 * Passes a stream through and reports the bytes that went by.
 *
 * @param options - The stream and the operation to report to.
 * @returns A stream with the same chunks.
 */
export function trackStream({ stream, operation }: {
  stream: ReadableStream<Uint8Array>;
  operation: ProgressReporter;
}) {
  let loaded = 0;
  return stream.pipeThrough(
    new TransformStream<Uint8Array, Uint8Array>({
      transform(chunk, controller) {
        loaded += chunk.byteLength;
        operation.update({ loaded });
        controller.enqueue(chunk);
      }
    })
  );
}
