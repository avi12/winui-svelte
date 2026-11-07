import { markOfTheWeb } from "./zone-identifier.ts";
import type { FileSystemFileHandle } from "#src/web-apis/file-system.js";

const HTTP_PARTIAL_CONTENT = 206;
const HTTP_RANGE_NOT_SATISFIABLE = 416;
const CONTENT_RANGE_START = /^bytes (\d+)-/;

/** What a transfer reports while it runs. */
export interface DownloadProgress {
  /** Bytes on disk so far, including the part a resumed download already had. */
  readonly loaded: number;

  /** The whole file's size, or undefined when the server did not say (or compressed the body). */
  readonly total: number | undefined;
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

/** What `requestDownload` takes. */
export interface DownloadRequestOptions {
  /** The address to fetch. */
  readonly url: string;

  /** Bytes already on disk from an earlier attempt; they are asked for with a Range request. */
  readonly offset?: number;

  /** Request headers. */
  readonly headers?: HeadersInit;

  /** The request method; `GET` by default. */
  readonly method?: string;

  /** The request body, for a `POST`. */
  readonly body?: BodyInit;

  /** Cancels the request and the reading of its body. */
  readonly signal?: AbortSignal;

  /** Stands in for the global `fetch`; the tests give one. */
  readonly fetch?: typeof fetch;
}

/** What `requestDownload` gives back. */
export interface DownloadResponse {
  readonly response: Response;

  /** The address the body came from after redirects, or the one asked for. */
  readonly url: string;

  /** Where in the file the body starts: the asked-for offset when the server continued it, else 0. */
  readonly offset: number;
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

function fetchFrom({ options, offset }: {
  options: DownloadRequestOptions;
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
    ...options.method !== undefined && {
      method: options.method
    },
    ...options.body !== undefined && {
      body: options.body
    },
    ...options.signal && {
      signal: options.signal
    }
  });
}

/**
 * Starts a download with `fetch`: with an offset it sends a Range request, a
 * refused range (416) is asked again from the start, and a server that ignores
 * the range (200) makes the body start at 0.
 *
 * @param options - The address, the offset to continue from and the request details.
 * @returns The response, ready to read, and where its body starts in the file.
 * @throws {DownloadError} When the server answers with a failing status.
 */
export async function requestDownload(options: DownloadRequestOptions) {
  let offset = options.offset ?? 0;
  let response = await fetchFrom({
    options,
    offset
  });
  const isRangeRefused = response.status === HTTP_RANGE_NOT_SATISFIABLE;
  if (isRangeRefused) {
    offset = 0;
    response = await fetchFrom({
      options,
      offset
    });
  }

  const isUnusable = !response.ok || response.body === null;
  if (isUnusable) {
    throw new DownloadError({
      status: response.status,
      url: options.url
    });
  }

  const isContinued = response.status === HTTP_PARTIAL_CONTENT && rangeStart(response) === offset;
  return {
    response,
    url: response.url || options.url,
    offset: isContinued ? offset : 0
  } satisfies DownloadResponse;
}

/** What `streamToFile` takes. */
export interface StreamToFileOptions {
  /** A response from `requestDownload`; its body is read once. */
  readonly download: DownloadResponse;

  /** The file to write: a handle from `showSaveFilePicker`, or from a folder handle. */
  readonly handle: FileSystemFileHandle;

  /** Called after every chunk. */
  readonly onprogress?: (progress: DownloadProgress) => void;
}

/**
 * Streams a response body into a file through `FileSystemWritableFileStream`.
 * What was received stays in the file when the read fails or is cancelled, so
 * a later `requestDownload` with that size can continue it. When the body is
 * whole the file gets the Mark of the Web (`Zone.Identifier`, ZoneId 3 and the
 * address), as a browser's download would.
 *
 * @param options - The response, the file and the optional progress hook.
 * @returns The size of the file.
 */
export async function streamToFile({ download, handle, onprogress }: StreamToFileOptions) {
  const { response, offset, url } = download;
  const { body } = response;
  const isEmpty = body === null;
  if (isEmpty) {
    throw new TypeError("The response has no body");
  }

  const length = contentLength(response);
  const total = length === undefined ? undefined : offset + length;
  const isContinuing = offset > 0;
  const writable = await handle.createWritable({ keepExistingData: isContinuing });
  if (isContinuing) {
    await writable.seek(offset);
  }

  let loaded = offset;
  let failure: unknown;
  try {
    for await (const chunk of body) {
      await writable.write(chunk);
      loaded += chunk.byteLength;
      onprogress?.({
        loaded,
        total
      });
    }
  } catch (error) {
    failure = error;
  }

  const hasFailed = failure !== undefined;
  if (hasFailed) {
    await writable.close().catch(() => undefined);
    throw failure;
  }

  await writable.close();
  await markOfTheWeb({
    path: handle.path,
    hostUrl: url
  });
  return loaded;
}

/** What `fetchToFile` takes. */
export interface FetchToFileOptions extends Omit<DownloadRequestOptions, "offset">, Pick<StreamToFileOptions, "handle" | "onprogress"> {
  /**
   * Continue the file the handle already holds with a Range request, as an
   * earlier, interrupted call left it; false by default, which starts over.
   */
  readonly resume?: boolean;
}

/**
 * Downloads an address into a file the way a browser page does: `fetch`
 * streamed into the handle `showSaveFilePicker` gave, with an optional Range
 * resume and the Mark of the Web on the finished file.
 *
 * @param options - The address, the file handle and the optional resume, progress and cancel hooks.
 * @returns The size of the finished file.
 * @throws {DownloadError} When the server answers with a failing status.
 */
export async function fetchToFile({ handle, resume: shouldResume, onprogress, ...request }: FetchToFileOptions) {
  const isResuming = shouldResume === true;
  const offset = isResuming ? (await handle.getFile()).size : 0;
  const download = await requestDownload({
    ...request,
    offset
  });
  return streamToFile({
    download,
    handle,
    ...onprogress && {
      onprogress
    }
  });
}
