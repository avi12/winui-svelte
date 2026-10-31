import { DomErrorName, domException } from "./dom-exception.ts";
import { defineProperty } from "./install.ts";
import { pickerExtensionsOf } from "#src/data-transfer/accept.js";
import { mediaTypeOf } from "#src/data-transfer/mime.js";
import type { NativeFile } from "#src/data-transfer/native-file.js";
import { nativeFileAt } from "#src/data-transfer/native-file.js";
import type { PickerOwner } from "#src/data-transfer/pickers.js";
import { pickFiles, pickSaveFile } from "#src/data-transfer/pickers.js";
import type { PickerOptions } from "#src/window/pickers.js";
import { PickerLocation } from "#src/window/pickers.js";
import {
  closeSync,
  copyFileSync,
  existsSync,
  ftruncateSync,
  mkdirSync,
  openSync,
  readdirSync,
  readFileSync,
  renameSync,
  rmdirSync,
  rmSync,
  statSync,
  unlinkSync,
  writeSync
} from "node:fs";
import path from "node:path";

const TYPE_MISMATCH = "TypeMismatchError";
const INVALID_MODIFICATION = "InvalidModificationError";
const NO_MODIFICATION_ALLOWED = "NoModificationAllowedError";
const PERMISSION_GRANTED = "granted";
const SWAP_SUFFIX = ".swap";
const PARENT_ENTRY = "..";
const CURRENT_ENTRY = ".";

/** The access a handle can have. */
export type FileSystemPermissionMode = "read" | "readwrite";

/** What `queryPermission` and `requestPermission` take. */
export interface FileSystemHandlePermissionDescriptor {
  readonly mode?: FileSystemPermissionMode;
}

function fileSystemError({ name, message }: {
  name: string;
  message: string;
}) {
  return new DOMException(message, name);
}

function translated(error: unknown) {
  const isError = error instanceof Error;
  const hasCode = isError && "code" in error;
  const code = hasCode ? error.code : undefined;
  const message = isError ? error.message : String(error);
  const isMissing = code === "ENOENT";
  if (isMissing) {
    return domException({
      name: DomErrorName.NOT_FOUND,
      message
    });
  }

  const isOccupied = code === "EEXIST" || code === "ENOTEMPTY";
  if (isOccupied) {
    return fileSystemError({
      name: INVALID_MODIFICATION,
      message
    });
  }

  const isDenied = code === "EACCES" || code === "EPERM" || code === "EBUSY";
  if (isDenied) {
    return fileSystemError({
      name: NO_MODIFICATION_ALLOWED,
      message
    });
  }

  return error;
}

function attempt<Result>(run: () => Result) {
  try {
    return Promise.resolve(run());
  } catch (error) {
    return Promise.reject(translated(error));
  }
}

function normalizedLocation(location: string) {
  return path.resolve(location).toLowerCase();
}

function assertEntryName(name: string) {
  const isInvalid = name === "" || name === CURRENT_ENTRY || name === PARENT_ENTRY || /[\\/]/u.test(name);
  if (isInvalid) {
    throw new TypeError(`Name is not allowed: '${name}'`);
  }
}

/** The handle of a file or folder, shared by the file and directory kinds. */
export abstract class FileSystemHandle {
  abstract readonly kind: "file" | "directory";
  readonly name: string;

  /** The full path on disk; a WinUI extra, a browser has none. */
  readonly path: string;

  /** Made by the pickers and by `FileSystemDirectoryHandle`. */
  protected constructor(location: string) {
    this.path = location;
    this.name = path.basename(location);
  }

  /** Whether the other handle is for the same file or folder. */
  isSameEntry(other: FileSystemHandle) {
    return Promise.resolve(normalizedLocation(this.path) === normalizedLocation(other.path));
  }

  /** The access the app has; always granted, because the user picked it or the app made it. */
  queryPermission(_descriptor?: FileSystemHandlePermissionDescriptor) {
    return Promise.resolve(PERMISSION_GRANTED);
  }

  /** The same as `queryPermission`; Windows asks nothing more. */
  requestPermission(_descriptor?: FileSystemHandlePermissionDescriptor) {
    return Promise.resolve(PERMISSION_GRANTED);
  }
}

/** What `createWritable` takes. */
export interface FileSystemCreateWritableOptions {
  readonly keepExistingData?: boolean;
}

/** One command of `FileSystemWritableFileStream.write`. */
export type WriteParams =
  | {
    readonly type: "write";
    readonly data?: FileSystemWriteChunk;
    readonly position?: number | null;
  }
  | {
    readonly type: "seek";
    readonly position: number;
  }
  | {
    readonly type: "truncate";
    readonly size: number;
  };

/** Data a write takes. */
export type FileSystemWriteChunk = Blob | ArrayBuffer | ArrayBufferView | string;

type FileSystemWriteInput = FileSystemWriteChunk | WriteParams;

async function bytesOf(chunk: FileSystemWriteChunk) {
  const isText = typeof chunk === "string";
  if (isText) {
    return new TextEncoder().encode(chunk);
  }

  const isBlob = chunk instanceof Blob;
  if (isBlob) {
    return new Uint8Array(await chunk.arrayBuffer());
  }

  if (ArrayBuffer.isView(chunk)) {
    return new Uint8Array(chunk.buffer, chunk.byteOffset, chunk.byteLength);
  }

  return new Uint8Array(chunk);
}

function isWriteParams(input: FileSystemWriteInput): input is WriteParams {
  const isObject = typeof input === "object" && !(input instanceof Blob) && !ArrayBuffer.isView(input);
  return isObject && "type" in input;
}

/**
 * The stream `createWritable` gives. It writes to a swap file next to the
 * target and renames it over the target on `close`, so a reader sees the old
 * file or the whole new one and `abort` leaves the target untouched.
 */
export class FileSystemWritableFileStream extends WritableStream<FileSystemWriteInput> {
  /** Made by `FileSystemFileHandle.createWritable`. */
  constructor({ target, shouldKeepExistingData }: {
    target: string;
    shouldKeepExistingData: boolean;
  }) {
    const swap = `${target}${SWAP_SUFFIX}`;
    const isKeeping = shouldKeepExistingData && existsSync(target);
    if (isKeeping) {
      copyFileSync(target, swap);
    }

    const descriptor = openSync(swap, isKeeping ? "r+" : "w+");
    let position = 0;
    function writeAt(bytes: Uint8Array) {
      writeSync(descriptor, bytes, 0, bytes.length, position);
      position += bytes.length;
    }
    async function apply(input: FileSystemWriteInput) {
      const params = isWriteParams(input) ? input : {
        type: "write",
        data: input
      } as const;
      const isSeek = params.type === "seek";
      if (isSeek) {
        position = params.position;
        return;
      }

      const isTruncate = params.type === "truncate";
      if (isTruncate) {
        ftruncateSync(descriptor, params.size);
        position = Math.min(position, params.size);
        return;
      }

      const { data } = params;
      const isMissing = data === undefined;
      if (isMissing) {
        throw new TypeError("Failed to execute 'write' on 'FileSystemWritableFileStream': Missing required 'data' member");
      }

      const hasPosition = typeof params.position === "number";
      if (hasPosition) {
        position = params.position ?? position;
      }

      writeAt(await bytesOf(data));
    }
    super({
      write: apply,
      close() {
        closeSync(descriptor);
        renameSync(swap, target);
      },
      abort() {
        closeSync(descriptor);
        unlinkSync(swap);
      }
    });
  }

  /** Writes data, or runs a `{ type, ... }` command, at the current position. */
  async write(input: FileSystemWriteInput) {
    await this.through(writer => writer.write(input));
  }

  /** Moves the position the next write starts at. */
  async seek(position: number) {
    await this.write({
      type: "seek",
      position
    });
  }

  /** Cuts or extends the file to a size. */
  async truncate(size: number) {
    await this.write({
      type: "truncate",
      size
    });
  }

  private async through(use: (writer: WritableStreamDefaultWriter<FileSystemWriteInput>) => Promise<void>) {
    const writer = this.getWriter();
    try {
      await use(writer);
    } finally {
      writer.releaseLock();
    }
  }
}

/**
 * What Windows adds to `FileSystemFileHandle`; a browser has none of it. They
 * autocomplete only where this module is imported.
 */
export interface FileSystemFileHandleExtras {
  /** The file as a `NativeFile`, with its path. */
  getNativeFile(): NativeFile;
}

declare global {
  // The extras join the standard handles wherever this module is imported.
  // eslint-disable-next-line @typescript-eslint/no-empty-object-type -- declaration merging is the point
  interface FileSystemFileHandle extends FileSystemFileHandleExtras {}
  interface FileSystemHandle {
    /** The full path on disk; a WinUI extra. */
    readonly path: string;
  }
}

/** A file. */
export class FileSystemFileHandle extends FileSystemHandle implements FileSystemFileHandleExtras {
  readonly kind = "file";

  /** Made by the pickers and by `FileSystemDirectoryHandle.getFileHandle`. */
  constructor(location: string) {
    super(location);
  }

  /** The file's content as a `File`. */
  getFile() {
    return attempt(() => {
      const details = statSync(this.path);
      return new File([readFileSync(this.path)], this.name, {
        type: mediaTypeOf(this.name),
        lastModified: Math.round(details.mtimeMs)
      });
    });
  }

  /** Opens the file for writing; nothing changes on disk until `close`. */
  createWritable(options: FileSystemCreateWritableOptions = {}) {
    return attempt(() => new FileSystemWritableFileStream({
      target: this.path,
      shouldKeepExistingData: options.keepExistingData === true
    }));
  }

  getNativeFile() {
    return nativeFileAt(this.path);
  }

  get [Symbol.toStringTag]() {
    return "FileSystemFileHandle";
  }
}

/** What `getFileHandle` and `getDirectoryHandle` take. */
export interface FileSystemGetHandleOptions {
  readonly create?: boolean;
}

/** What `removeEntry` takes. */
export interface FileSystemRemoveOptions {
  readonly recursive?: boolean;
}

/** A folder. */
export class FileSystemDirectoryHandle extends FileSystemHandle {
  readonly kind = "directory";

  /** Made by the pickers and by `getDirectoryHandle`. */
  constructor(location: string) {
    super(location);
  }

  /**
   * A file in this folder.
   *
   * @throws {TypeError} For a name with a separator, `.` or `..`.
   * @throws {DOMException} `NotFoundError` without `create` when it does not exist; `TypeMismatchError` for a folder.
   */
  // eslint-disable-next-line no-restricted-syntax -- the standard method signature
  getFileHandle(name: string, options: FileSystemGetHandleOptions = {}) {
    return this.entryLocation({
      name,
      kind: "file",
      shouldCreate: options.create === true,
      create: location => closeSync(openSync(location, "a"))
    }).then(location => new FileSystemFileHandle(location));
  }

  /**
   * A folder in this folder.
   *
   * @throws {TypeError} For a name with a separator, `.` or `..`.
   * @throws {DOMException} `NotFoundError` without `create` when it does not exist; `TypeMismatchError` for a file.
   */
  // eslint-disable-next-line no-restricted-syntax -- the standard method signature
  getDirectoryHandle(name: string, options: FileSystemGetHandleOptions = {}) {
    return this.entryLocation({
      name,
      kind: "directory",
      shouldCreate: options.create === true,
      create: location => mkdirSync(location)
    }).then(location => new FileSystemDirectoryHandle(location));
  }

  /**
   * Deletes a file or folder of this folder.
   *
   * @throws {DOMException} `NotFoundError`, or `InvalidModificationError` for a folder with entries and no `recursive`.
   */
  // eslint-disable-next-line no-restricted-syntax -- the standard method signature
  removeEntry(name: string, options: FileSystemRemoveOptions = {}) {
    return attempt(() => {
      assertEntryName(name);
      const location = path.join(this.path, name);
      const isDirectory = statSync(location).isDirectory();
      if (!isDirectory) {
        unlinkSync(location);
        return;
      }

      const isRecursive = options.recursive === true;
      if (isRecursive) {
        rmSync(location, { recursive: true });
        return;
      }

      rmdirSync(location);
    });
  }

  /**
   * The names from this folder down to a handle.
   *
   * @returns The names, empty for this folder, or null when the handle is not inside it.
   */
  resolve(possibleDescendant: FileSystemHandle) {
    const relative = path.relative(this.path, possibleDescendant.path);
    const isOutside = relative.startsWith(PARENT_ENTRY) || path.isAbsolute(relative);
    if (isOutside) {
      return Promise.resolve(null);
    }

    return Promise.resolve(relative === "" ? [] : relative.split(path.sep));
  }

  /** Each entry as `[name, handle]`. */
  async *entries() {
    for (const entry of readdirSync(this.path, { withFileTypes: true })) {
      const location = path.join(this.path, entry.name);
      const isFolder = entry.isDirectory();
      const handle = isFolder ? new FileSystemDirectoryHandle(location) : new FileSystemFileHandle(location);
      yield [entry.name, handle] as const;
    }
  }

  /** The names of the entries. */
  async *keys() {
    for await (const [name] of this.entries()) {
      yield name;
    }
  }

  /** The handles of the entries. */
  async *values() {
    for await (const [, handle] of this.entries()) {
      yield handle;
    }
  }

  [Symbol.asyncIterator]() {
    return this.entries();
  }

  get [Symbol.toStringTag]() {
    return "FileSystemDirectoryHandle";
  }

  private entryLocation({ name, kind, shouldCreate, create }: {
    name: string;
    kind: "file" | "directory";
    shouldCreate: boolean;
    create: (location: string) => void;
  }) {
    return attempt(() => {
      assertEntryName(name);
      const location = path.join(this.path, name);
      this.assertEntry({
        location,
        kind,
        shouldCreate,
        create: () => create(location)
      });
      return location;
    });
  }

  private assertEntry({ location, kind, shouldCreate, create }: {
    location: string;
    kind: "file" | "directory";
    shouldCreate: boolean;
    create: () => void;
  }) {
    const isPresent = existsSync(location);
    const isForbidden = !isPresent && !shouldCreate;
    if (isForbidden) {
      throw domException({
        name: DomErrorName.NOT_FOUND,
        message: `A requested file or directory could not be found: ${path.basename(location)}`
      });
    }

    if (!isPresent) {
      create();
      return;
    }

    const isDirectory = statSync(location).isDirectory();
    const isMatch = isDirectory === (kind === "directory");
    if (!isMatch) {
      throw fileSystemError({
        name: TYPE_MISMATCH,
        message: `The path supplied exists, but was not an entry of requested type: ${path.basename(location)}`
      });
    }
  }
}

/**
 * A handle for a folder on disk that is already trusted: the app's own
 * folders, such as the origin private file system.
 *
 * @param location - The folder's path.
 * @returns Its handle.
 */
export function directoryHandleAt(location: string) {
  return new FileSystemDirectoryHandle(location);
}

/** One entry of a picker's `types`. */
export interface FilePickerAcceptType {
  readonly description?: string;
  readonly accept: Readonly<Record<string, string | readonly string[]>>;
}

/** What WinUI adds to the options of the pickers; a browser ignores them. */
export interface FilePickerExtras {
  /** The dialog's title. */
  readonly title?: string;

  /** The text of the button that accepts the choice. */
  readonly commitButtonText?: string;

  /** A well-known folder to open in, such as `downloads`. */
  readonly suggestedStartLocation?: PickerLocation;

  /** A folder to open in, by path; wins over `startIn`. */
  readonly startFolder?: string;

  /** Whether the save dialog asks before replacing a file (it does by default). */
  readonly shouldPromptOverwrite?: boolean;

  /** The extension added when the user types a name without one. */
  readonly defaultFileExtension?: string;
}

/** The standard options of the three pickers, with the extras. */
export interface FilePickerInit extends FilePickerExtras {
  readonly id?: string;
  readonly startIn?: string | FileSystemHandle;
  readonly mode?: FileSystemPermissionMode;
  readonly types?: readonly FilePickerAcceptType[];
  readonly excludeAcceptAllOption?: boolean;
  readonly multiple?: boolean;
  readonly suggestedName?: string;
}

/** What a picker dialog is asked for. */
export interface OpenRequest extends PickerOptions {
  readonly extensions: readonly string[];
  readonly isMultiple: boolean;
  readonly isFolder: boolean;
}

/** What the save dialog is asked for. */
export interface SaveRequest extends PickerOptions {
  readonly extensions: readonly string[];
  readonly suggestedFileName?: string;
  readonly defaultFileExtension?: string;
  readonly shouldPromptOverwrite?: boolean;
}

/** What the picker Web APIs run on; the tests give a fake. Cancelling gives no path. */
export interface PickerBackend {
  pickOpen(request: OpenRequest): Promise<string[]>;
  pickSave(request: SaveRequest): Promise<string | null>;
}

/**
 * The Windows App SDK pickers, over `pickFiles` and `pickSaveFile` of
 * `data-transfer`. They open over a window, so the app says which.
 *
 * @param owner - Gives the window or control the dialogs open over.
 * @returns The backend the real install uses.
 */
export function windowsPickerBackend(owner: () => PickerOwner) {
  return {
    async pickOpen({ extensions, isMultiple, isFolder, ...options }) {
      const files = await pickFiles({
        ...options,
        owner: owner(),
        multiple: isMultiple,
        directory: isFolder,
        ...extensions.length > 0 && {
          accept: extensions
        }
      });
      return files.map(file => file.path);
    },
    pickSave({ extensions, ...options }) {
      return pickSaveFile({
        ...options,
        owner: owner(),
        ...extensions.length > 0 && {
          accept: extensions
        }
      });
    }
  } satisfies PickerBackend;
}

function startOf(init: FilePickerInit) {
  const { startIn } = init;
  const hasHandle = startIn instanceof FileSystemHandle;
  if (hasHandle) {
    return {
      startFolder: startIn.kind === "file" ? path.dirname(startIn.path) : startIn.path
    };
  }

  const location = Object.values(PickerLocation).find(known => known === startIn);
  return location === undefined ? {} : { startIn: location };
}

function dialogOptionsOf(init: FilePickerInit) {
  return {
    ...startOf(init),
    ...init.id !== undefined && {
      settingsIdentifier: init.id
    },
    ...init.title !== undefined && {
      title: init.title
    },
    ...init.commitButtonText !== undefined && {
      commitButtonText: init.commitButtonText
    },
    ...init.suggestedStartLocation !== undefined && {
      startIn: init.suggestedStartLocation
    },
    ...init.startFolder !== undefined && {
      startFolder: init.startFolder
    }
  };
}

function extensionsOf(init: FilePickerInit) {
  const accepted = (init.types ?? []).flatMap(type => Object.entries(type.accept).flatMap(([mediaType, extensions]) => [
    mediaType,
    ...typeof extensions === "string" ? [extensions] : extensions
  ]));
  return pickerExtensionsOf(accepted);
}

function cancelled() {
  return domException({
    name: DomErrorName.ABORT,
    message: "The user aborted a request."
  });
}

/** The three `show...Picker` functions. */
export class FileSystemPickers {
  private readonly backend: PickerBackend;

  /** Made by `installFileSystem`. */
  constructor(backend: PickerBackend) {
    this.backend = backend;
  }

  /**
   * Asks the user for files.
   *
   * @throws {DOMException} `AbortError` when the user cancels.
   */
  async showOpenFilePicker(init: FilePickerInit = {}) {
    const paths = await this.backend.pickOpen({
      ...dialogOptionsOf(init),
      extensions: extensionsOf(init),
      isMultiple: init.multiple === true,
      isFolder: false
    });
    const isCancelled = paths.length === 0;
    if (isCancelled) {
      throw cancelled();
    }

    return paths.map(location => new FileSystemFileHandle(location));
  }

  /**
   * Asks the user where to save a file; the file is created empty when it is new.
   *
   * @throws {DOMException} `AbortError` when the user cancels.
   */
  async showSaveFilePicker(init: FilePickerInit = {}) {
    const location = await this.backend.pickSave({
      ...dialogOptionsOf(init),
      extensions: extensionsOf(init),
      ...init.suggestedName !== undefined && {
        suggestedFileName: init.suggestedName
      },
      ...init.defaultFileExtension !== undefined && {
        defaultFileExtension: init.defaultFileExtension
      },
      ...init.shouldPromptOverwrite !== undefined && {
        shouldPromptOverwrite: init.shouldPromptOverwrite
      }
    });
    const isCancelled = location === null;
    if (isCancelled) {
      throw cancelled();
    }

    await attempt(() => closeSync(openSync(location, "a")));
    return new FileSystemFileHandle(location);
  }

  /**
   * Asks the user for a folder.
   *
   * @throws {DOMException} `AbortError` when the user cancels.
   */
  async showDirectoryPicker(init: FilePickerInit = {}) {
    const [location] = await this.backend.pickOpen({
      ...dialogOptionsOf(init),
      extensions: [],
      isMultiple: false,
      isFolder: true
    });
    const isCancelled = location === undefined;
    if (isCancelled) {
      throw cancelled();
    }

    return new FileSystemDirectoryHandle(location);
  }
}

/** What `installFileSystem` takes. */
export interface FileSystemInstallOptions {
  /** Gives the window or control the dialogs open over; needed unless a `backend` is given. */
  readonly owner?: () => PickerOwner;

  /** Stands in for the Windows App SDK pickers; the tests give one. */
  readonly backend?: PickerBackend;
}

function noWindow() {
  return domException({
    name: DomErrorName.INVALID_STATE,
    message: "installFileSystem was given no owner: pass the window the dialogs open over"
  });
}

/**
 * Defines the File System Access API: `showOpenFilePicker`,
 * `showSaveFilePicker`, `showDirectoryPicker` and the handle classes. The
 * handles read and write the real files, so they work for files the user
 * picked and for the app's own folders. Call it on the window thread.
 *
 * @param options - The window the dialogs open over, or a backend for tests.
 * @returns The function that takes them away again.
 */
export function installFileSystem(options: FileSystemInstallOptions = {}) {
  const { owner } = options;
  const backend = options.backend ?? windowsPickerBackend(() => {
    const hasOwner = owner !== undefined;
    if (!hasOwner) {
      throw noWindow();
    }

    return owner();
  });
  const pickers = new FileSystemPickers(backend);
  const uninstalls = [
    defineProperty({
      name: "showOpenFilePicker",
      value: (init?: FilePickerInit) => pickers.showOpenFilePicker(init)
    }),
    defineProperty({
      name: "showSaveFilePicker",
      value: (init?: FilePickerInit) => pickers.showSaveFilePicker(init)
    }),
    defineProperty({
      name: "showDirectoryPicker",
      value: (init?: FilePickerInit) => pickers.showDirectoryPicker(init)
    }),
    ...[
      FileSystemHandle,
      FileSystemFileHandle,
      FileSystemDirectoryHandle,
      FileSystemWritableFileStream
    ].map(value => defineProperty({
      name: value.name,
      value
    }))
  ];
  return () => {
    for (const uninstall of uninstalls.reverse()) {
      uninstall();
    }
  };
}
