import type { DataKind } from "./accept.ts";
import { DataKind as Kinds } from "./accept.ts";
import type { DataSnapshot, DeferredProvider } from "./data-transfer.ts";
import { DataTransfer, FormatType } from "./data-transfer.ts";
import { fragmentOfHtmlFormat } from "./html-format.ts";
import type { NativeFile } from "./native-file.ts";

// Between a `DataTransfer` (the web's shape) and a WinUI `DataPackage`: the
// mapping lives here against two small interfaces, so it is tested with
// fakes; `winrt-package.ts` implements them over the real classes.

/** What is read from a `DataPackageView`. */
export interface PackageSource {
  /** The format ids the data offers, as WinUI names them. */
  formats(): string[];
  has(kind: DataKind): boolean;
  readText(): Promise<string>;
  /** The HTML format text (CF_HTML). */
  readHtml(): Promise<string>;
  readUri(): Promise<string>;
  readFiles(): Promise<NativeFile[]>;
  readBitmap(): Promise<NativeFile>;
  /** A custom format's text, undefined when it is not text. */
  readCustom(format: string): Promise<string | undefined>;
}

/** What is written to a `DataPackage`. */
export interface PackageTarget {
  setText(text: string): void;
  /** Takes the fragment; the CF_HTML text is made for it. */
  setHtml(fragment: string): void;
  setUri(uri: string): void;
  setCustom(options: {
    format: string;
    value: string;
  }): void;
  setFiles(files: readonly NativeFile[]): Promise<void>;
  setBitmap(file: NativeFile): Promise<void>;
  /** Offers a format whose data is made when a paste or a drop asks for it. */
  setDeferred(options: {
    type: string;
    provider: DeferredProvider;
  }): void;
}

const IMAGE_PREFIX = "image/";

/**
 * Whether a type is a picture format.
 *
 * @param type - A web type.
 * @returns True for `image/...`.
 */
export function isImageType(type: string) {
  return type.startsWith(IMAGE_PREFIX);
}

/**
 * The address a `text/uri-list` holds: its first line that is not a comment.
 *
 * @param list - The list text.
 * @returns The address, or the whole text when there is none.
 */
export function uriOfList(list: string) {
  return list.split(/\r?\n/u).find(line => line !== "" && !line.startsWith("#")) ?? list;
}

const KINDS_BY_TYPE = [
  [Kinds.text, FormatType.text],
  [Kinds.html, FormatType.html],
  [Kinds.uri, FormatType.uri],
  [Kinds.bitmap, FormatType.bitmap]
] as const;

// The ids WinUI and Windows give the formats `has` already answers for.
const STANDARD_FORMATS = new Set([
  "text",
  "unicodetext",
  "html format",
  "html",
  "uri",
  "uniformresourcelocator",
  "uniformresourcelocatorw",
  "weblink",
  "applicationlink",
  "storageitems",
  "filedrop",
  "filename",
  "filenamew",
  "bitmap",
  "deviceindependentbitmap",
  "rtf",
  "rich text format"
]);

function isCustomFormat(format: string) {
  return !STANDARD_FORMATS.has(format.toLowerCase());
}

/**
 * The types a package offers, which a drag target can read before the drop.
 *
 * @param source - The package view.
 * @returns The web's names: media types, `Files`, the custom format ids.
 */
function typesOf(source: PackageSource) {
  const standard: string[] = KINDS_BY_TYPE.filter(([kind]) => source.has(kind)).map(([, type]) => type);
  const hasFiles = source.has(Kinds.file);
  const custom = source.formats().filter(isCustomFormat);
  return [...standard, ...hasFiles ? [FormatType.files] : [], ...custom];
}

/**
 * Reads what a package holds: the text formats, the files and folders, and
 * the custom formats named. A format that fails to read is left out.
 *
 * @param options - The package view, and the custom format ids to read as text.
 * @returns The data in the web's shape.
 */
export async function snapshotOf({ source, customFormats = [] }: {
  source: PackageSource;
  customFormats?: readonly string[];
}) {
  const strings = new Map<string, string>();
  const files: NativeFile[] = [];
  const tasks: (() => Promise<void>)[] = [];
  if (source.has(Kinds.text)) {
    tasks.push(async () => {
      strings.set(FormatType.text, await source.readText());
    });
  }

  if (source.has(Kinds.html)) {
    tasks.push(async () => {
      strings.set(FormatType.html, fragmentOfHtmlFormat(await source.readHtml()));
    });
  }

  if (source.has(Kinds.uri)) {
    tasks.push(async () => {
      strings.set(FormatType.uri, await source.readUri());
    });
  }

  if (source.has(Kinds.file)) {
    tasks.push(async () => {
      files.push(...await source.readFiles());
    });
  }

  if (source.has(Kinds.bitmap)) {
    tasks.push(async () => {
      files.push(await source.readBitmap());
    });
  }

  for (const format of customFormats) {
    tasks.push(async () => {
      const value = await source.readCustom(format);
      const hasValue = value !== undefined;
      if (hasValue) {
        strings.set(format, value);
      }
    });
  }

  await Promise.all(tasks.map(task => task().catch(() => undefined)));
  const snapshot: DataSnapshot = {
    strings,
    files,
    types: typesOf(source)
  };
  return snapshot;
}

/**
 * A `DataTransfer` for a package, filled with its types only: what a drag
 * target can see before the drop.
 *
 * @param source - The package view.
 * @returns The transfer, with `types` and nothing readable.
 */
export function previewOf(source: PackageSource) {
  return new DataTransfer({
    strings: new Map(),
    files: [],
    types: typesOf(source)
  });
}

/**
 * Puts what a drag source set in a `DataTransfer` into a package.
 *
 * @param options - The transfer and the package to fill.
 */
export async function fillPackage({ transfer, target }: {
  transfer: DataTransfer;
  target: PackageTarget;
}) {
  for (const [type, value] of transfer.entries()) {
    const isText = type === FormatType.text;
    if (isText) {
      target.setText(value);
    } else if (type === FormatType.html) {
      target.setHtml(value);
    } else if (type === FormatType.uri) {
      target.setUri(uriOfList(value));
    } else {
      target.setCustom({
        format: type,
        value
      });
    }
  }

  for (const [type, provider] of transfer.deferredEntries()) {
    target.setDeferred({
      type,
      provider
    });
  }

  const hasFiles = transfer.files.length > 0;
  if (hasFiles) {
    await target.setFiles(transfer.files);
  }

  const { bitmap } = transfer;
  if (bitmap) {
    await target.setBitmap(bitmap);
  }
}
