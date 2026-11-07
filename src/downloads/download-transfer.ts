import type { DownloadRecord, StoredItem } from "./download-record.ts";
import { suggestedName, uniquePath } from "./download-target.ts";
import { DownloadState, FilenameConflictAction } from "./download-types.ts";
import type { DownloadResponse } from "./fetch-to-file.ts";
import { requestDownload, streamToFile } from "./fetch-to-file.ts";
import { FileSystemFileHandle } from "#src/web-apis/file-system.js";
import { TaskbarProgressState } from "#src/window/taskbar-calls.js";
import { mkdir, rename, stat } from "node:fs/promises";
import path from "node:path";

/** What a transfer needs from the downloads object that runs it. */
export interface TransferContext {
  /** The folder a relative `filename` is inside. */
  readonly directory: string;
  readonly fetch: typeof fetch | undefined;

  /** Asks the user where to save; resolves with the file's handle. */
  readonly pickSaveFile: (init: { suggestedName: string }) => Promise<FileSystemFileHandle>;
  readonly update: (options: {
    record: DownloadRecord;
    changes: Partial<StoredItem>;
  }) => void;
}

async function sizeOf(location: string) {
  try {
    return (await stat(location)).size;
  } catch {
    return 0;
  }
}

function headersOf(pairs: ReadonlyArray<{
  name: string;
  value: string;
}> | undefined) {
  const headers = new Headers();
  for (const { name, value } of pairs ?? []) {
    headers.append(name, value);
  }

  return headers;
}

async function resolveTarget({ record, download, context }: {
  record: DownloadRecord;
  download: DownloadResponse;
  context: TransferContext;
}) {
  const { options } = record;
  const name = suggestedName({
    filename: options.filename,
    disposition: download.response.headers.get("content-disposition"),
    address: download.url
  });
  const isAsked = options.saveAs === true || options.conflictAction === FilenameConflictAction.PROMPT;
  if (isAsked) {
    const handle = await context.pickSaveFile({ suggestedName: path.basename(name) });
    record.finalPath = handle.path;
    record.partialPath = handle.path;
    return;
  }

  const wanted = path.join(context.directory, name);
  const isOverwriting = options.conflictAction === FilenameConflictAction.OVERWRITE;
  const finalPath = isOverwriting ? wanted : uniquePath(wanted);
  await mkdir(path.dirname(finalPath), { recursive: true });
  record.finalPath = finalPath;
  record.partialPath = `${finalPath}.part`;
}

/**
 * Runs one attempt of a download: asks for the file (the rest of it when
 * `isResuming`), picks where it goes the first time, streams it to disk and,
 * when it is whole, moves it to its name.
 *
 * @param options - The record, whether it continues an earlier attempt, and the context.
 * @throws {Error} Whatever stopped the attempt, for the caller to read as paused, cancelled or interrupted.
 */
export async function transfer({ record, isResuming, context }: {
  record: DownloadRecord;
  isResuming: boolean;
  context: TransferContext;
}) {
  const { options } = record;
  const { partialPath: earlierPath } = record;
  const isContinuing = isResuming && earlierPath !== undefined;
  const offset = isContinuing ? await sizeOf(earlierPath) : 0;
  const download = await requestDownload({
    url: options.url,
    offset,
    headers: headersOf(options.headers),
    signal: record.controller.signal,
    ...options.method !== undefined && {
      method: options.method
    },
    ...options.body !== undefined && {
      body: options.body
    },
    ...context.fetch && {
      fetch: context.fetch
    }
  });
  const isUnplaced = record.partialPath === undefined;
  if (isUnplaced) {
    await resolveTarget({
      record,
      download,
      context
    });
  }

  const { partialPath, finalPath } = record;
  const isPlaced = partialPath !== undefined && finalPath !== undefined;
  if (!isPlaced) {
    throw new Error("The download has no place to go");
  }

  context.update({
    record,
    changes: {
      filename: finalPath,
      finalUrl: download.url,
      mime: download.response.headers.get("content-type")?.split(";")[0]?.trim() ?? ""
    }
  });
  const bytes = await streamToFile({
    download,
    handle: new FileSystemFileHandle(partialPath),
    onprogress(progress) {
      context.update({
        record,
        changes: {
          bytesReceived: progress.loaded,
          totalBytes: progress.total ?? -1
        }
      });
      record.report.update(progress);
    }
  });
  const isMoved = partialPath !== finalPath;
  if (isMoved) {
    await rename(partialPath, finalPath);
  }

  record.report.end(TaskbarProgressState.NONE);
  context.update({
    record,
    changes: {
      state: DownloadState.COMPLETE,
      endTime: new Date().toISOString(),
      bytesReceived: bytes,
      totalBytes: bytes,
      fileSize: bytes,
      exists: true,
      canResume: false,
      paused: false
    }
  });
}
