import { ChromeEvent } from "./chrome-event.ts";
import { selectItems } from "./download-query.ts";
import type { DownloadRecord, StoredItem } from "./download-record.ts";
import { deltaOf, DownloadIntent, newItem, publicItem } from "./download-record.ts";
import { assertRelativeFilename } from "./download-target.ts";
import type { TransferContext } from "./download-transfer.ts";
import { transfer } from "./download-transfer.ts";
import type { DownloadDelta, DownloadItem, DownloadOptions, DownloadQuery } from "./download-types.ts";
import { DownloadState, InterruptReason, parseDownloadOptions, parseDownloadQuery } from "./download-types.ts";
import { interruptionOf } from "./interrupt-reason.ts";
import { taskbarReporter } from "./taskbar-progress.ts";
import { revealInExplorer } from "#src/data-transfer/launcher.js";
import { FileSystemFileHandle } from "#src/web-apis/file-system.js";
import { TaskbarProgressState } from "#src/window/taskbar-calls.js";
import { existsSync } from "node:fs";
import { rm, unlink } from "node:fs/promises";
import { homedir } from "node:os";
import path from "node:path";

const DOWNLOADS_FOLDER = "Downloads";
const SAVE_PICKER = "showSaveFilePicker";
const ABORT_ERROR = "AbortError";

/** What the `Downloads` object takes. */
export interface DownloadsOptions {
  /** The folder a relative `filename` is inside; the user's Downloads folder by default. */
  readonly directory?: string;

  /** Stands in for the global `fetch`; the tests give one. */
  readonly fetch?: typeof fetch;

  /** Opens Explorer on a file or folder; `revealInExplorer` by default, the tests give a fake. */
  readonly reveal?: (location: string) => void;

  /**
   * Asks the user where to save (`saveAs`); the global `showSaveFilePicker`
   * by default, which `installFileSystem` defines.
   */
  readonly pickSaveFile?: TransferContext["pickSaveFile"];
}

function isSavePicker(value: unknown): value is (init: { suggestedName: string }) => Promise<unknown> {
  return typeof value === "function";
}

async function globalSavePicker(init: { suggestedName: string }) {
  const picker: unknown = Object.getOwnPropertyDescriptor(globalThis, SAVE_PICKER)?.value;
  const isMissing = !isSavePicker(picker);
  if (isMissing) {
    throw new Error(`saveAs needs ${SAVE_PICKER}: call installFileSystem first, or pass pickSaveFile`);
  }

  const handle: unknown = await picker(init);
  const isHandle = handle instanceof FileSystemFileHandle;
  if (!isHandle) {
    throw new TypeError(`${SAVE_PICKER} did not return a file handle`);
  }

  return handle;
}

function isUserCancel(error: unknown) {
  return error instanceof DOMException && error.name === ABORT_ERROR;
}

/**
 * `chrome.downloads` for a Windows app: the same names and shapes, with
 * promises where Chrome takes a callback. A download streams over `fetch`
 * into a ".part" file that is renamed to its name when whole, carries the
 * Mark of the Web, and continues after a pause or an interruption with a
 * Range request.
 */
export class Downloads {
  /** Fires when a download starts, with its item. */
  readonly onCreated = new ChromeEvent<(item: DownloadItem) => void>();

  /** Fires when a property of a download changes, with only what changed. */
  readonly onChanged = new ChromeEvent<(delta: DownloadDelta) => void>();

  /** Fires with the id of a download `erase` took from the list. */
  readonly onErased = new ChromeEvent<(id: number) => void>();

  private readonly records = new Map<number, DownloadRecord>();
  private readonly directory: string;
  private readonly reveal: (location: string) => void;
  private readonly context: TransferContext;
  private nextId = 1;

  constructor(options: DownloadsOptions = {}) {
    this.directory = options.directory ?? path.join(homedir(), DOWNLOADS_FOLDER);
    this.reveal = options.reveal ?? revealInExplorer;
    this.context = {
      directory: this.directory,
      fetch: options.fetch,
      pickSaveFile: options.pickSaveFile ?? globalSavePicker,
      update: ({ record, changes }) => this.update({
        record,
        changes
      })
    };
  }

  /**
   * Starts a download.
   *
   * @param options - Chrome's `DownloadOptions`, and the taskbar extra.
   * @returns The id of the new download, once it has started.
   * @throws {ZodError} When the options do not have Chrome's shape.
   * @throws {Error} When `filename` would leave the downloads folder.
   */
  async download(options: DownloadOptions) {
    const parsed = parseDownloadOptions(options);
    const { filename } = parsed;
    const isNamed = filename !== undefined;
    if (isNamed) {
      assertRelativeFilename(filename);
    }

    const id = this.nextId;
    this.nextId += 1;
    const record: DownloadRecord = {
      item: newItem({
        id,
        url: parsed.url,
        startTime: new Date().toISOString()
      }),
      options: parsed,
      report: taskbarReporter(options.taskbar),
      partialPath: undefined,
      finalPath: undefined,
      intent: undefined,
      controller: new AbortController(),
      running: Promise.resolve()
    };
    this.records.set(id, record);
    this.onCreated.dispatch(publicItem(record.item));
    this.start({
      record,
      isResuming: false
    });
    return id;
  }

  /**
   * Stops a download's transfer and keeps what arrived; `resume` continues it.
   *
   * @param downloadId - The id `download` returned.
   * @throws {Error} When the download is unknown, not running or already paused.
   */
  async pause(downloadId: number) {
    const record = this.recordOf(downloadId);
    const isRunning = record.item.state === DownloadState.IN_PROGRESS && !record.item.paused;
    if (!isRunning) {
      throw new Error(`Download ${downloadId} is not running`);
    }

    await this.stop({
      record,
      intent: DownloadIntent.PAUSE
    });
  }

  /**
   * Continues a paused download, or an interrupted one that can resume, with
   * a Range request for the rest.
   *
   * @param downloadId - The id `download` returned.
   * @throws {Error} When the download is unknown or cannot resume.
   */
  resume(downloadId: number) {
    const record = this.recordOf(downloadId);
    const isPaused = record.item.state === DownloadState.IN_PROGRESS && record.item.paused;
    const isResumable = isPaused || record.item.state === DownloadState.INTERRUPTED && record.item.canResume;
    if (!isResumable) {
      return Promise.reject(new Error(`Download ${downloadId} cannot resume`));
    }

    this.start({
      record,
      isResuming: true
    });
    return Promise.resolve();
  }

  /**
   * Stops a download for good and deletes the bytes that arrived; it ends
   * `interrupted` with the error `USER_CANCELED`. A finished download is left.
   *
   * @param downloadId - The id `download` returned.
   * @throws {Error} When the download is unknown.
   */
  async cancel(downloadId: number) {
    const record = this.recordOf(downloadId);
    const isFinished = record.item.state === DownloadState.COMPLETE;
    if (isFinished) {
      return;
    }

    const isRunning = record.item.state === DownloadState.IN_PROGRESS && !record.item.paused;
    if (isRunning) {
      await this.stop({
        record,
        intent: DownloadIntent.CANCEL
      });
      return;
    }

    await this.discard(record);
  }

  /**
   * The downloads that match a query.
   *
   * @param query - Chrome's `DownloadQuery`; every given field must match.
   * @returns Their items.
   * @throws {ZodError} When the query does not have Chrome's shape.
   */
  async search(query: DownloadQuery = {}) {
    const parsed = parseDownloadQuery(query);
    return selectItems({
      items: this.items(),
      query: parsed
    });
  }

  /**
   * Takes downloads that are not running out of the list; their files stay.
   *
   * @param query - Chrome's `DownloadQuery`.
   * @returns The ids it removed.
   * @throws {ZodError} When the query does not have Chrome's shape.
   */
  async erase(query: DownloadQuery) {
    const matching = await this.search(query);
    const erasable = matching.filter(item => item.state !== DownloadState.IN_PROGRESS || item.paused);
    for (const { id } of erasable) {
      this.records.delete(id);
      this.onErased.dispatch(id);
    }

    return erasable.map(item => item.id);
  }

  /**
   * Opens Explorer with a finished download's file selected.
   *
   * @param downloadId - The id `download` returned.
   * @throws {Error} When the download is unknown or has no file yet.
   */
  show(downloadId: number) {
    const { filename } = this.recordOf(downloadId).item;
    const hasNoFile = filename === "";
    if (hasNoFile) {
      return Promise.reject(new Error(`Download ${downloadId} has no file yet`));
    }

    this.reveal(filename);
    return Promise.resolve();
  }

  /** Opens Explorer on the folder downloads go to. */
  showDefaultFolder() {
    this.reveal(this.directory);
    return Promise.resolve();
  }

  /**
   * Deletes a finished download's file; the item stays in the list with
   * `exists` false.
   *
   * @param downloadId - The id `download` returned.
   * @throws {Error} When the download is unknown, not finished or its file is gone.
   */
  async removeFile(downloadId: number) {
    const record = this.recordOf(downloadId);
    const hasFile = record.item.state === DownloadState.COMPLETE && existsSync(record.item.filename);
    if (!hasFile) {
      throw new Error(`Download ${downloadId} has no file to remove`);
    }

    await unlink(record.item.filename);
    this.update({
      record,
      changes: {
        exists: false
      }
    });
  }

  private items() {
    return [...this.records.values()].map(({ item }) => {
      const stored = publicItem(item);
      const isComplete = item.state === DownloadState.COMPLETE;
      return {
        ...stored,
        exists: isComplete && existsSync(item.filename)
      };
    });
  }

  private recordOf(downloadId: number) {
    const record = this.records.get(downloadId);
    const isUnknown = record === undefined;
    if (isUnknown) {
      throw new Error(`Invalid download id ${downloadId}`);
    }

    return record;
  }

  private update({ record, changes }: {
    record: DownloadRecord;
    changes: Partial<StoredItem>;
  }) {
    const before = record.item;
    const after = {
      ...before,
      ...changes
    };
    const delta = deltaOf({
      before,
      after
    });
    record.item = after;
    const hasChanged = Object.keys(delta).length > 1;
    if (hasChanged) {
      this.onChanged.dispatch(delta);
    }
  }

  private start({ record, isResuming }: {
    record: DownloadRecord;
    isResuming: boolean;
  }) {
    record.controller = new AbortController();
    record.intent = undefined;
    this.update({
      record,
      changes: {
        state: DownloadState.IN_PROGRESS,
        paused: false,
        canResume: false,
        error: undefined
      }
    });
    record.running = this.run({
      record,
      isResuming
    });
  }

  private async run({ record, isResuming }: {
    record: DownloadRecord;
    isResuming: boolean;
  }) {
    try {
      await transfer({
        record,
        isResuming,
        context: this.context
      });
    } catch (error) {
      await this.settle({
        record,
        error
      });
    }
  }

  private async stop({ record, intent }: {
    record: DownloadRecord;
    intent: DownloadIntent;
  }) {
    record.intent = intent;
    record.controller.abort();
    await record.running;
  }

  private async settle({ record, error }: {
    record: DownloadRecord;
    error: unknown;
  }) {
    const { intent } = record;
    const isPausing = intent === DownloadIntent.PAUSE;
    if (isPausing) {
      record.report.end(TaskbarProgressState.PAUSED);
      this.update({
        record,
        changes: {
          paused: true,
          canResume: true
        }
      });
      return;
    }

    const isCancelled = intent === DownloadIntent.CANCEL || isUserCancel(error);
    if (isCancelled) {
      await this.discard(record);
      return;
    }

    const { reason, canResume } = interruptionOf(error);
    record.report.end(TaskbarProgressState.ERROR);
    this.update({
      record,
      changes: {
        state: DownloadState.INTERRUPTED,
        error: reason,
        canResume,
        paused: false
      }
    });
  }

  private async discard(record: DownloadRecord) {
    const { partialPath } = record;
    const isPlaced = partialPath !== undefined;
    if (isPlaced) {
      await rm(partialPath, { force: true });
    }

    record.report.end(TaskbarProgressState.NONE);
    this.update({
      record,
      changes: {
        state: DownloadState.INTERRUPTED,
        error: InterruptReason.USER_CANCELED,
        canResume: false,
        paused: false
      }
    });
  }
}
