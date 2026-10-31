import { defineProperty } from "./install.ts";
import type { Activation } from "#src/app/redirect.js";
import { readFile, stat } from "node:fs/promises";
import path from "node:path";

const URL_PATTERN = /^[a-z][a-z0-9+.-]+:/iu;

/** A file the app was started with, shaped like a `FileSystemFileHandle`. */
export interface LaunchFile {
  readonly kind: "file";
  readonly name: string;

  /** The full path on disk. WinUI-only. */
  readonly path: string;
  getFile(): Promise<File>;
}

/** What one start or redirect of the app carried. */
export interface LaunchParams {
  /** The first protocol address on the command line, or `undefined`. */
  readonly targetURL: string | undefined;

  /** The files on the command line, in order. */
  readonly files: readonly LaunchFile[];
}

/** What `installLaunch` takes. */
export interface LaunchInstallOptions {
  /**
   * The command line arguments of this start, without the program; the
   * default is `process.argv` minus the first two entries. Pass `[]` for
   * none.
   */
  readonly initialArguments?: readonly string[];

  /** Answers whether a path names a file; the default asks the disk. A test stands in. */
  readonly isFile?: (candidate: string) => Promise<boolean>;

  /** Reads a file; the default reads the disk. A test stands in. */
  readonly read?: (candidate: string) => Promise<Uint8Array>;
}

declare global {
  // The queue joins the global scope wherever this module is imported.

  var launchQueue: LaunchQueue;
}

async function defaultIsFile(candidate: string) {
  const status = await stat(candidate).catch(() => undefined);
  return status?.isFile() ?? false;
}

/** The Launch Handler API's `launchQueue`. */
export class LaunchQueue {
  private consumer: ((params: LaunchParams) => unknown) | undefined;
  private pending: LaunchParams[] = [];
  private readonly isFile: (candidate: string) => Promise<boolean>;
  private readonly read: (candidate: string) => Promise<Uint8Array>;

  /** Made by `installLaunch`. */
  constructor({ isFile, read }: {
    isFile: (candidate: string) => Promise<boolean>;
    read: (candidate: string) => Promise<Uint8Array>;
  }) {
    this.isFile = isFile;
    this.read = read;
  }

  /**
   * Sets the one consumer, which gets every launch, those already waiting
   * first.
   *
   * @param callback - Called with each `LaunchParams`.
   */
  setConsumer(callback: (params: LaunchParams) => unknown) {
    this.consumer = callback;
    const waiting = this.pending;
    this.pending = [];
    for (const params of waiting) {
      void callback(params);
    }
  }

  /**
   * Hands the queue what a later copy of the app was started with, as
   * `ensureSingleInstance`'s `onRedirect` receives it. WinUI-only.
   */
  async enqueueActivation(activation: Activation) {
    const params = await this.paramsOf(activation);
    const { consumer } = this;
    const isWaiting = consumer === undefined;
    if (isWaiting) {
      this.pending.push(params);
      return;
    }

    await consumer(params);
  }

  private async paramsOf({ arguments: values, workingDirectory }: Activation) {
    let targetURL: string | undefined;
    const files: LaunchFile[] = [];
    for (const value of values) {
      const isAddress = URL_PATTERN.test(value);
      if (isAddress) {
        targetURL ??= value;
        continue;
      }

      const full = path.resolve(workingDirectory, value);
      const isExisting = await this.isFile(full);
      if (isExisting) {
        files.push(this.fileOf(full));
      }
    }

    return {
      targetURL,
      files
    };
  }

  private fileOf(full: string) {
    const name = path.basename(full);
    return {
      kind: "file",
      name,
      path: full,
      getFile: async () => new File([new Uint8Array(await this.read(full))], name)
    } satisfies LaunchFile;
  }

  get [Symbol.toStringTag]() {
    return "LaunchQueue";
  }
}

/**
 * Defines `globalThis.launchQueue`. The command line this start came with is
 * the first launch; the extra `enqueueActivation` takes the later ones (wire
 * it to `ensureSingleInstance`'s `onRedirect`). Arguments that look like an
 * address (`scheme:`, two letters or more) become `targetURL`, those that name
 * an existing file become `files`, the rest are ignored. Registering the
 * protocol or file type with Windows is the installer's job. Nothing is
 * defined until this is called.
 *
 * @param options - The initial arguments, and stand-ins for the disk.
 * @returns The function that takes it away again.
 */
export function installLaunch(options: LaunchInstallOptions = {}) {
  const queue = new LaunchQueue({
    isFile: options.isFile ?? defaultIsFile,
    read: options.read ?? (candidate => readFile(candidate))
  });
  const uninstall = defineProperty({
    name: "launchQueue",
    value: queue
  });
  const initial = options.initialArguments ?? process.argv.slice(2);
  const hasInitial = initial.length > 0;
  if (hasInitial) {
    void queue.enqueueActivation({
      arguments: [...initial],
      workingDirectory: process.cwd()
    });
  }

  return uninstall;
}
