import type { DropEffect, EffectAllowed } from "./drag-effects.ts";
import { EffectAllowed as Allowed, DropEffect as Effects } from "./drag-effects.ts";
import type { NativeFile } from "./native-file.ts";

/** The names the standard formats have on the web. */
export const FormatType = {
  text: "text/plain",
  html: "text/html",
  uri: "text/uri-list",
  files: "Files",
  bitmap: "image/png"
} as const;

/** One of `FormatType`'s values. */
export type FormatType = (typeof FormatType)[keyof typeof FormatType];

/**
 * Makes the data of one format when something asks for it: a paste, or a
 * drop. A picture format (`image/...`) gives a `NativeFile`; every other
 * format gives text.
 */
export type DeferredProvider = () => Promise<string | NativeFile>;

/** What a drop or the clipboard held, read in full. */
export interface DataSnapshot {
  /** The text-like formats by type (`text/plain`, `text/html`, `text/uri-list`, the custom ones). */
  readonly strings: ReadonlyMap<string, string>;
  readonly files: readonly NativeFile[];
  /** Every format the data offers, the ones not read included. */
  readonly types: readonly string[];
}

/** One format of a `DataTransfer`, as the web's `DataTransferItem`. */
export interface DataTransferItem {
  readonly kind: "string" | "file";
  readonly type: string;
  /** Calls back with the text, like the web. */
  getAsString(callback: (value: string) => void): void;
  /** The file, or null for a text item. */
  getAsFile(): NativeFile | null;
}

/** The items of a `DataTransfer`, as the web's `DataTransferItemList`. */
export class DataTransferItemList {
  private readonly owner: DataTransfer;

  constructor(owner: DataTransfer) {
    this.owner = owner;
  }

  /** The number of items. */
  get length() {
    return this.toArray().length;
  }

  /** The item at an index, undefined past the end. */
  item(index: number) {
    return this.toArray().at(index);
  }

  /** Adds a text format (`add("hello", "text/plain")`) or a file (`add(file)`). */
  // eslint-disable-next-line no-restricted-syntax -- the web's DataTransferItemList.add(data, type)
  add(data: string | NativeFile, type?: string) {
    const isText = typeof data === "string";
    if (isText) {
      this.owner.setData(type ?? FormatType.text, data);
      return;
    }

    this.owner.addFile(data);
  }

  /** Removes every item. */
  clear() {
    this.owner.clearData();
  }

  [Symbol.iterator]() {
    return this.toArray()[Symbol.iterator]();
  }

  private toArray() {
    const strings = this.owner.entries().map(([type, value]) => ({
      kind: "string",
      type,
      getAsString(callback) {
        callback(value);
      },
      getAsFile() {
        return null;
      }
    } satisfies DataTransferItem));
    const files = this.owner.files.map(file => ({
      kind: "file",
      type: file.type,
      getAsString() {
        // A file item has no text; the web gives the callback nothing.
      },
      getAsFile() {
        return file;
      }
    } satisfies DataTransferItem));
    return [...strings, ...files];
  }
}

/**
 * The data of a drag or a paste, shaped like the web's `DataTransfer`:
 * `types`, `getData(type)`, `files` (as `NativeFile`), `items`, `effectAllowed`
 * and `dropEffect`. A drag source fills it in `ondragstart` with `setData`,
 * `items.add` or `files`; a target reads it. While a drag is over a target the
 * files and text are not readable yet (as on the web): only `types` is, and on
 * the drop everything is.
 */
export class DataTransfer {
  /** What the source lets a target do; a source sets it in `ondragstart`. */
  effectAllowed: EffectAllowed = Allowed.uninitialized;
  /** What the target will do; a target sets it in `ondragenter` or `ondragover`. */
  dropEffect: DropEffect = Effects.none;
  /** A picture to drag (a path or an in-memory file): WinUI shows its own preview of the data. */
  bitmap: NativeFile | undefined;
  private readonly strings = new Map<string, string>();
  private readonly deferred = new Map<string, DeferredProvider>();
  private readonly fileList: NativeFile[] = [];
  private readonly offered: readonly string[];

  constructor(snapshot?: DataSnapshot) {
    this.offered = snapshot?.types ?? [];
    for (const [type, value] of snapshot?.strings ?? []) {
      this.strings.set(type, value);
    }

    this.fileList.push(...snapshot?.files ?? []);
  }

  /** The formats on offer: media types, `Files` when there are files, custom formats as named. */
  get types() {
    const set = new Set([...this.offered, ...this.strings.keys(), ...this.deferred.keys()]);
    const hasFiles = this.fileList.length > 0;
    if (hasFiles) {
      set.add(FormatType.files);
    }

    return [...set];
  }

  /** The files and folders, as `NativeFile`; empty until the drop. */
  get files() {
    return this.fileList;
  }

  /** The items, one per format and file. */
  get items() {
    return new DataTransferItemList(this);
  }

  /** The text of a format; empty when it is not there or not readable yet. */
  getData(type: string) {
    return this.strings.get(type) ?? "";
  }

  /** Puts the text of a format; a source does this in `ondragstart`. */
  // eslint-disable-next-line no-restricted-syntax -- the web's DataTransfer.setData(type, value)
  setData(type: string, value: string) {
    this.deferred.delete(type);
    this.strings.set(type, value);
  }

  /**
   * Offers a format whose data is made only when a paste or a drop asks for
   * it (WinUI's `SetDataProvider`); a source does this in `ondragstart`.
   */
  setDeferredData({ type, provider }: {
    type: string;
    provider: DeferredProvider;
  }) {
    this.strings.delete(type);
    this.deferred.set(type, provider);
  }

  /** Removes a format, or all of them (and the files) when none is named. */
  clearData(type?: string) {
    const isAll = type === undefined;
    if (isAll) {
      this.strings.clear();
      this.deferred.clear();
      this.fileList.length = 0;
      return;
    }

    this.strings.delete(type);
    this.deferred.delete(type);
  }

  /** Adds a file or folder to drag; a source does this in `ondragstart`. */
  addFile(file: NativeFile) {
    this.fileList.push(file);
  }

  /** The text formats set so far, as [type, text] pairs. */
  entries() {
    return [...this.strings];
  }

  /** The formats offered with deferred data, as [type, provider] pairs. */
  deferredEntries() {
    return [...this.deferred];
  }

  /** Accepted for the web's signature; WinUI draws its own preview of the data, so the element is not used. */
  setDragImage(..._arguments: unknown[]) {
    // No custom drag image: the preview comes from the data.
  }
}
