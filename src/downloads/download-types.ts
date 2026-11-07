import type { DownloadTaskbar } from "./taskbar-progress.ts";
import { z } from "zod";

/** The states of `DownloadItem.state`, as `chrome.downloads.State`. */
export const DownloadState = {
  IN_PROGRESS: "in_progress",
  INTERRUPTED: "interrupted",
  COMPLETE: "complete"
} as const;
/** One of the values of `DownloadState`. */
export type DownloadState = (typeof DownloadState)[keyof typeof DownloadState];

/** The reasons of `DownloadItem.error`, as `chrome.downloads.InterruptReason`: the ones a download here ends with. */
export const InterruptReason = {
  FILE_FAILED: "FILE_FAILED",
  FILE_ACCESS_DENIED: "FILE_ACCESS_DENIED",
  FILE_NO_SPACE: "FILE_NO_SPACE",
  FILE_NAME_TOO_LONG: "FILE_NAME_TOO_LONG",
  FILE_TOO_LARGE: "FILE_TOO_LARGE",
  NETWORK_FAILED: "NETWORK_FAILED",
  SERVER_FAILED: "SERVER_FAILED",
  SERVER_BAD_CONTENT: "SERVER_BAD_CONTENT",
  SERVER_UNAUTHORIZED: "SERVER_UNAUTHORIZED",
  SERVER_FORBIDDEN: "SERVER_FORBIDDEN",
  USER_CANCELED: "USER_CANCELED"
} as const;
/** One of the values of `InterruptReason`. */
export type InterruptReason = (typeof InterruptReason)[keyof typeof InterruptReason];

/** The values of `DownloadOptions.conflictAction`, as `chrome.downloads.FilenameConflictAction`. */
export const FilenameConflictAction = {
  UNIQUIFY: "uniquify",
  OVERWRITE: "overwrite",
  PROMPT: "prompt"
} as const;
/** One of the values of `FilenameConflictAction`. */
export type FilenameConflictAction = (typeof FilenameConflictAction)[keyof typeof FilenameConflictAction];

/** The values of `DownloadOptions.method`, as `chrome.downloads.HttpMethod`. */
export const HttpMethod = {
  GET: "GET",
  POST: "POST"
} as const;
/** One of the values of `HttpMethod`. */
export type HttpMethod = (typeof HttpMethod)[keyof typeof HttpMethod];

const downloadOptionsSchema = z.object({
  url: z.url(),
  filename: z.string().min(1).optional(),
  saveAs: z.boolean().optional(),
  conflictAction: z.enum(FilenameConflictAction).optional(),
  headers: z.array(
    z.object({
      name: z.string(),
      value: z.string()
    })
  ).optional(),
  method: z.enum(HttpMethod).optional(),
  body: z.string().optional()
});

const timeSchema = z.union([z.string(), z.number()]);

const downloadQuerySchema = z.object({
  query: z.array(z.string()).optional(),
  startedBefore: timeSchema.optional(),
  startedAfter: timeSchema.optional(),
  endedBefore: timeSchema.optional(),
  endedAfter: timeSchema.optional(),
  totalBytesGreater: z.number().optional(),
  totalBytesLess: z.number().optional(),
  filenameRegex: z.string().optional(),
  urlRegex: z.string().optional(),
  finalUrlRegex: z.string().optional(),
  limit: z.number().int().nonnegative().optional(),
  orderBy: z.array(z.string()).optional(),
  id: z.number().int().optional(),
  url: z.string().optional(),
  finalUrl: z.string().optional(),
  filename: z.string().optional(),
  mime: z.string().optional(),
  startTime: z.string().optional(),
  endTime: z.string().optional(),
  state: z.enum(DownloadState).optional(),
  paused: z.boolean().optional(),
  error: z.enum(InterruptReason).optional(),
  bytesReceived: z.number().optional(),
  totalBytes: z.number().optional(),
  fileSize: z.number().optional(),
  exists: z.boolean().optional()
}).strict();

/** What `download` takes, as `chrome.downloads.DownloadOptions`, without WinUI's extra. */
export type ChromeDownloadOptions = z.input<typeof downloadOptionsSchema>;

/** What `download` takes: Chrome's options and one WinUI extra. */
export interface DownloadOptions extends ChromeDownloadOptions {
  /** A window's taskbar button (`handle.taskbar`) to show this download's progress on. */
  readonly taskbar?: DownloadTaskbar;
}

/** What `search` and `erase` take, as `chrome.downloads.DownloadQuery`. */
export type DownloadQuery = z.input<typeof downloadQuerySchema>;

/**
 * Checks `download`'s options against the Chrome shape.
 *
 * @param options - The options as the caller gave them.
 * @returns The options, or a thrown `ZodError` naming what is wrong.
 */
export function parseDownloadOptions(options: unknown) {
  return downloadOptionsSchema.parse(options);
}

/**
 * Checks a query against the Chrome shape; an unknown key is an error.
 *
 * @param query - The query as the caller gave it.
 * @returns The query, or a thrown `ZodError` naming what is wrong.
 */
export function parseDownloadQuery(query: unknown) {
  return downloadQuerySchema.parse(query);
}

/** One download, as `chrome.downloads.DownloadItem`. */
export interface DownloadItem {
  readonly id: number;
  readonly url: string;
  readonly finalUrl: string;
  readonly referrer: string;
  readonly filename: string;
  readonly incognito: boolean;
  readonly danger: "safe";
  readonly mime: string;
  readonly startTime: string;
  readonly endTime?: string;
  readonly state: DownloadState;
  readonly paused: boolean;
  readonly canResume: boolean;
  readonly error?: InterruptReason;
  readonly bytesReceived: number;

  /** The size the server announced, or -1 when it did not. */
  readonly totalBytes: number;

  /** The size on disk once complete, or -1 before. */
  readonly fileSize: number;
  readonly exists: boolean;
}

/** A change of one property of `DownloadDelta`. */
export interface Delta<Value> {
  readonly previous?: Value | undefined;
  readonly current?: Value | undefined;
}

/** What `onChanged` reports, as `chrome.downloads.DownloadDelta`: only the changed properties. */
export interface DownloadDelta {
  readonly id: number;
  readonly url?: Delta<string>;
  readonly finalUrl?: Delta<string>;
  readonly filename?: Delta<string>;
  readonly mime?: Delta<string>;
  readonly endTime?: Delta<string>;
  readonly state?: Delta<DownloadState>;
  readonly canResume?: Delta<boolean>;
  readonly paused?: Delta<boolean>;
  readonly error?: Delta<InterruptReason>;
  readonly bytesReceived?: Delta<number>;
  readonly totalBytes?: Delta<number>;
  readonly fileSize?: Delta<number>;
  readonly exists?: Delta<boolean>;
}
