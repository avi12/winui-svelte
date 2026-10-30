import { mediaTypeOf } from "./mime.ts";
import {
  closeSync,
  openSync,
  readdirSync,
  readFileSync,
  readSync,
  statSync
} from "node:fs";
import path from "node:path";

const STREAM_CHUNK_BYTES = 65_536;

/** What a dropped or picked item is on disk. */
export const FileKind = {
  file: "file",
  directory: "directory"
} as const;

/** One of `FileKind`'s values. */
export type FileKind = (typeof FileKind)[keyof typeof FileKind];

/** What a `NativeFile` is made from. */
export interface NativeFileInit {
  path: string;
  name: string;
  size: number;
  type: string;
  lastModified: number;
  kind: FileKind;

  /** The bytes of a file that has no path (a pasted picture). */
  content?: Uint8Array;
}

/**
 * A file or folder the user gave the app, shaped like the web's `File`: its
 * `name`, `size`, `type` and `lastModified`, and `text()`, `bytes()`,
 * `arrayBuffer()` and `stream()` to read it. It reads from the path with
 * Node's own file system, so no WinRT stream is involved. A folder has
 * `kind` `directory` and its `entries()`.
 */
export class NativeFile {
  /** The full path; empty for a file that exists only in memory. */
  readonly path: string;
  readonly name: string;
  /** Bytes; 0 for a folder. */
  readonly size: number;
  /** The media type by extension; empty when not known. */
  readonly type: string;
  /** Milliseconds since 1970. */
  readonly lastModified: number;
  readonly kind: FileKind;
  private readonly content: Uint8Array | undefined;

  constructor(init: NativeFileInit) {
    this.path = init.path;
    this.name = init.name;
    this.size = init.size;
    this.type = init.type;
    this.lastModified = init.lastModified;
    this.kind = init.kind;
    this.content = init.content;
  }

  /** The file's bytes. */
  bytes() {
    return this.attempt(() => {
      this.assertReadable();
      return Uint8Array.from(this.content ?? readFileSync(this.path));
    });
  }

  /** The file's bytes as an `ArrayBuffer`. */
  arrayBuffer() {
    return this.attempt(() => {
      this.assertReadable();
      return Uint8Array.from(this.content ?? readFileSync(this.path)).buffer;
    });
  }

  /** The file's content as text (UTF-8). */
  text() {
    return this.attempt(() => {
      this.assertReadable();
      return this.content ? new TextDecoder().decode(this.content) : readFileSync(this.path, "utf8");
    });
  }

  /** The file's content as a stream of byte chunks of 64 KiB, read as the consumer asks. */
  stream() {
    this.assertReadable();
    const { content } = this;
    if (content) {
      return new Blob([Uint8Array.from(content)]).stream();
    }

    const descriptor = openSync(this.path, "r");
    return new ReadableStream<Uint8Array>({
      pull(controller) {
        const chunk = new Uint8Array(STREAM_CHUNK_BYTES);
        const count = readSync(descriptor, chunk, 0, STREAM_CHUNK_BYTES, null);
        const isEnd = count === 0;
        if (isEnd) {
          closeSync(descriptor);
          controller.close();
          return;
        }

        controller.enqueue(chunk.subarray(0, count));
      },
      cancel() {
        closeSync(descriptor);
      }
    });
  }

  /** The items of a folder. */
  entries() {
    const isFolder = this.kind === FileKind.directory;
    if (!isFolder) {
      throw new Error(`${this.name} is not a folder`);
    }

    return readdirSync(this.path).map(name => nativeFileAt(path.join(this.path, name)));
  }

  // Reads are synchronous: the window's thread never runs Node's own file callbacks.
  // They give a promise so a call site reads as the web's File does.
  private attempt<Result>(read: () => Result) {
    try {
      return Promise.resolve(read());
    } catch (error) {
      return Promise.reject(error);
    }
  }

  private assertReadable() {
    const isFolder = this.kind === FileKind.directory;
    if (isFolder) {
      throw new Error(`${this.name} is a folder: read its entries()`);
    }
  }
}

/**
 * Reads what is at a path. It uses the synchronous file system, because the
 * window's thread never runs Node's own file callbacks.
 *
 * @param filePath - A file or folder.
 * @returns The `NativeFile` for it.
 */
export function nativeFileAt(filePath: string) {
  const details = statSync(filePath);
  const isFolder = details.isDirectory();
  const name = path.basename(filePath);
  return new NativeFile({
    path: filePath,
    name,
    size: isFolder ? 0 : details.size,
    type: isFolder ? "" : mediaTypeOf(name),
    lastModified: Math.round(details.mtimeMs),
    kind: isFolder ? FileKind.directory : FileKind.file
  });
}

/**
 * A file that exists only in memory (a picture from the clipboard).
 *
 * @param options - Its name, media type and bytes.
 * @returns The `NativeFile` for it, with an empty `path`.
 */
export function nativeFileOfBytes({ name, type, content }: {
  name: string;
  type: string;
  content: Uint8Array;
}) {
  return new NativeFile({
    path: "",
    name,
    size: content.length,
    type,
    lastModified: Date.now(),
    kind: FileKind.file,
    content
  });
}
