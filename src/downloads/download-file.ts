import { markOfTheWeb } from "./zone-identifier.ts";
import type { TaskbarProgressOptions } from "#src/window/taskbar-calls.js";
import { TaskbarProgressState } from "#src/window/taskbar-calls.js";
import { open, rename, stat } from "node:fs/promises";

const PARTIAL_SUFFIX = ".part";
const HTTP_PARTIAL_CONTENT = 206;
const HTTP_RANGE_NOT_SATISFIABLE = 416;
const PROGRESS_STEPS = 1000;
const CONTENT_RANGE_START = /^bytes (\d+)-/;

/** What `downloadFile` reports while it runs. */
export interface DownloadProgress {
  /** Bytes on disk so far, including the part a resumed download already had. */
  readonly loaded: number;

  /** The whole file's size, or undefined when the server did not say (or compressed the body). */
  readonly total: number | undefined;
}

/** The part of a window's taskbar button that `downloadFile` drives: `handle.taskbar` fits. */
export interface DownloadTaskbar {
  setProgress(options: TaskbarProgressOptions): void;
}

/** What `downloadFile` takes. */
export interface DownloadFileOptions {
  /** The address to fetch. */
  readonly url: string;

  /** Where the finished file goes; the bytes arrive in `path` + ".part" and are renamed on success. */
  readonly path: string;

  /** Called after every chunk. */
  readonly onprogress?: (progress: DownloadProgress) => void;

  /**
   * Continue an earlier, interrupted download of the same address from its
   * ".part" file with a Range request; false by default.
   */
  readonly resume?: boolean;

  /** A window's taskbar button (`handle.taskbar`) to show the progress on. */
  readonly taskbar?: DownloadTaskbar;

  /** Cancels the download; the ".part" file stays so a later call can resume. */
  readonly signal?: AbortSignal;

  /** Request headers. */
  readonly headers?: HeadersInit;

  /** Stands in for the global `fetch`; the tests give one. */
  readonly fetch?: typeof fetch;
}

/** A download the server refused. */
export class DownloadError extends Error {
  readonly status: number;

  constructor({ status, url }: {
    status: number;
    url: string;
  }) {
    super(`Download of ${url} failed with HTTP ${status}`);
    this.name = "DownloadError";
    this.status = status;
  }
}

async function partialSize(partial: string) {
  try {
    return (await stat(partial)).size;
  } catch {
    return 0;
  }
}

function contentLength(response: Response) {
  const isCompressed = response.headers.has("content-encoding");
  const text = response.headers.get("content-length");
  const hasNoLength = isCompressed || text === null;
  if (hasNoLength) {
    return undefined;
  }

  return Number(text);
}

function rangeStart(response: Response) {
  const match = CONTENT_RANGE_START.exec(response.headers.get("content-range") ?? "");
  return match?.[1] === undefined ? undefined : Number(match[1]);
}

function taskbarReporter(taskbar: DownloadTaskbar | undefined) {
  let lastStep = -1;
  return {
    update({ loaded, total }: DownloadProgress) {
      const isHidden = taskbar === undefined;
      if (isHidden) {
        return;
      }

      const isUnknown = total === undefined || total === 0;
      if (isUnknown) {
        taskbar.setProgress({ state: TaskbarProgressState.INDETERMINATE });
        return;
      }

      const step = Math.floor(loaded / total * PROGRESS_STEPS);
      const isSameStep = step === lastStep;
      if (isSameStep) {
        return;
      }

      lastStep = step;
      taskbar.setProgress({
        state: TaskbarProgressState.NORMAL,
        value: loaded / total
      });
    },
    end(state: TaskbarProgressState) {
      taskbar?.setProgress({ state });
    }
  };
}

async function request({ options, offset }: {
  options: DownloadFileOptions;
  offset: number;
}) {
  const headers = new Headers(options.headers);
  const isResuming = offset > 0;
  if (isResuming) {
    headers.set("range", `bytes=${offset}-`);
  }

  const fetchImpl = options.fetch ?? fetch;
  return fetchImpl(options.url, {
    headers,
    ...options.signal && {
      signal: options.signal
    }
  });
}

async function transfer({ options, report }: {
  options: DownloadFileOptions;
  report: ReturnType<typeof taskbarReporter>;
}) {
  const { url, path, onprogress } = options;
  const isResuming = options.resume === true;
  const partial = `${path}${PARTIAL_SUFFIX}`;
  let offset = isResuming ? await partialSize(partial) : 0;
  let response = await request({
    options,
    offset
  });
  const isRangeRefused = response.status === HTTP_RANGE_NOT_SATISFIABLE;
  if (isRangeRefused) {
    offset = 0;
    response = await request({
      options,
      offset
    });
  }

  const { body } = response;
  const isUnusable = !response.ok || body === null;
  if (isUnusable) {
    throw new DownloadError({
      status: response.status,
      url
    });
  }

  const isContinued = response.status === HTTP_PARTIAL_CONTENT && rangeStart(response) === offset;
  if (!isContinued) {
    offset = 0;
  }

  const length = contentLength(response);
  const total = length === undefined ? undefined : offset + length;
  const file = await open(partial, offset > 0 ? "a" : "w");
  let loaded = offset;
  try {
    for await (const chunk of body) {
      await file.write(chunk);
      loaded += chunk.byteLength;
      const progress = {
        loaded,
        total
      };
      onprogress?.(progress);
      report.update(progress);
    }
  } finally {
    await file.close();
  }

  await rename(partial, path);
  await markOfTheWeb({
    path,
    hostUrl: response.url || url
  });
  return loaded;
}

/**
 * Downloads a file over `fetch`, streaming it to disk: a Range request
 * continues an interrupted download, the finished file carries the Mark of the
 * Web (`Zone.Identifier`, ZoneId 3 and the address) so Explorer and
 * SmartScreen treat it as downloaded, and the progress can show on a window's
 * taskbar button. A failure other than a cancel leaves the button's bar red.
 *
 * @param options - The address, the destination and the optional progress, resume, taskbar and cancel hooks.
 * @returns The path and the size of the finished file.
 */
export async function downloadFile(options: DownloadFileOptions) {
  const report = taskbarReporter(options.taskbar);
  try {
    const bytes = await transfer({
      options,
      report
    });
    report.end(TaskbarProgressState.NONE);
    return {
      path: options.path,
      bytes
    };
  } catch (error) {
    const isCancelled = options.signal?.aborted === true;
    report.end(isCancelled ? TaskbarProgressState.NONE : TaskbarProgressState.ERROR);
    throw error;
  }
}
