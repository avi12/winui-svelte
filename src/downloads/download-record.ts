import type { ChromeDownloadOptions, DownloadDelta, DownloadItem, InterruptReason } from "./download-types.ts";
import { DownloadState } from "./download-types.ts";
import type { taskbarReporter } from "./taskbar-progress.ts";

/** What a caller of `pause` or `cancel` asked for, so the transfer's abort is read the right way. */
export const DownloadIntent = {
  PAUSE: "pause",
  CANCEL: "cancel"
} as const;
/** One of the values of `DownloadIntent`. */
export type DownloadIntent = (typeof DownloadIntent)[keyof typeof DownloadIntent];

/** A `DownloadItem` with every property present, so an update can clear `error` and `endTime`. */
export interface StoredItem extends Omit<DownloadItem, "endTime" | "error"> {
  readonly endTime: string | undefined;
  readonly error: InterruptReason | undefined;
}

/** Everything the downloads object keeps about one download. */
export interface DownloadRecord {
  item: StoredItem;
  readonly options: ChromeDownloadOptions;
  readonly report: ReturnType<typeof taskbarReporter>;

  /** Where the bytes arrive: the final path plus ".part", or the final path itself when the user picked it. */
  partialPath: string | undefined;
  finalPath: string | undefined;
  intent: DownloadIntent | undefined;
  controller: AbortController;
  running: Promise<void>;
}

/**
 * The `DownloadItem` a listener or a search result sees.
 *
 * @param stored - The record's item.
 * @returns A copy without the properties that are not set.
 */
export function publicItem(stored: StoredItem) {
  const { endTime, error, ...rest } = stored;
  return {
    ...rest,
    ...endTime !== undefined && {
      endTime
    },
    ...error !== undefined && {
      error
    }
  } satisfies DownloadItem;
}

/**
 * What changed between two states of a download, as `onChanged` reports it.
 *
 * @param options - The item before and after.
 * @returns The delta, which holds only `id` when nothing changed.
 */
export function deltaOf({ before, after }: {
  before: StoredItem;
  after: StoredItem;
}) {
  return {
    id: after.id,
    ...before.url !== after.url && {
      url: {
        previous: before.url,
        current: after.url
      }
    },
    ...before.finalUrl !== after.finalUrl && {
      finalUrl: {
        previous: before.finalUrl,
        current: after.finalUrl
      }
    },
    ...before.filename !== after.filename && {
      filename: {
        previous: before.filename,
        current: after.filename
      }
    },
    ...before.mime !== after.mime && {
      mime: {
        previous: before.mime,
        current: after.mime
      }
    },
    ...before.endTime !== after.endTime && {
      endTime: {
        previous: before.endTime,
        current: after.endTime
      }
    },
    ...before.state !== after.state && {
      state: {
        previous: before.state,
        current: after.state
      }
    },
    ...before.canResume !== after.canResume && {
      canResume: {
        previous: before.canResume,
        current: after.canResume
      }
    },
    ...before.paused !== after.paused && {
      paused: {
        previous: before.paused,
        current: after.paused
      }
    },
    ...before.error !== after.error && {
      error: {
        previous: before.error,
        current: after.error
      }
    },
    ...before.bytesReceived !== after.bytesReceived && {
      bytesReceived: {
        previous: before.bytesReceived,
        current: after.bytesReceived
      }
    },
    ...before.totalBytes !== after.totalBytes && {
      totalBytes: {
        previous: before.totalBytes,
        current: after.totalBytes
      }
    },
    ...before.fileSize !== after.fileSize && {
      fileSize: {
        previous: before.fileSize,
        current: after.fileSize
      }
    },
    ...before.exists !== after.exists && {
      exists: {
        previous: before.exists,
        current: after.exists
      }
    }
  } satisfies DownloadDelta;
}

/**
 * The item of a download that has just been asked for.
 *
 * @param options - Its id, address and start time.
 * @returns The item, in progress with nothing received.
 */
export function newItem({ id, url, startTime }: {
  id: number;
  url: string;
  startTime: string;
}) {
  return {
    id,
    url,
    finalUrl: url,
    referrer: "",
    filename: "",
    incognito: false,
    danger: "safe",
    mime: "",
    startTime,
    endTime: undefined,
    state: DownloadState.IN_PROGRESS,
    paused: false,
    canResume: false,
    error: undefined,
    bytesReceived: 0,
    totalBytes: -1,
    fileSize: -1,
    exists: false
  } satisfies StoredItem;
}
