import { DataKind } from "./accept.ts";
import { nativeFileAt } from "./native-file.ts";
import { formatIdOf } from "./native.ts";
import type { PackageSource } from "./package-io.ts";
import { pathsOfShellIdList } from "./shell-items.ts";
import { DynCom, DynComFormatEtc, DynComMethodSig, WinGuid } from "@microsoft/dynwinrt/com/unsafe";
import type { DynWinRTValue } from "@microsoft/dynwinrt/com/unsafe";

// What another process puts on a drag, read through the `IDataObject` OLE
// hands a drop target (Explorer's files, a browser's text): the classic
// clipboard formats, mapped to the same `PackageSource` a WinUI package view
// gives, so a zone judges and reads both the same way.

const DATA_OBJECT_IID = "0000010e-0000-0000-c000-000000000046";
const GET_DATA_SLOT = 3;
const CF_UNICODETEXT = 13;
const CF_HDROP = 15;
const HTML_FORMAT_NAME = "HTML Format";
const URL_FORMAT_NAME = "UniformResourceLocatorW";
const SHELL_ID_LIST_FORMAT_NAME = "Shell IDList Array";
const DROPFILES_WIDE_OFFSET = 16;
const DROPFILES_PATHS_POINTER = 0;
const WIDE_NULL = "\0";

/** What `PackageSource` reads, synchronously: a live data object, or a copy of one. */
export interface OleReader {
  has(kind: DataKind): boolean;
  text(): string;
  html(): string;
  uri(): string;
  paths(): string[];
}

let cachedCalls: ReturnType<typeof makeCalls> | undefined;

function makeCalls() {
  return {
    dataObject: DynCom.registerIUnknownInterface("IDataObject", WinGuid.parse(DATA_OBJECT_IID)).addMethodAt(
      GET_DATA_SLOT,
      "GetData",
      new DynComMethodSig().addIn(DynCom.formatEtcType()).addOut(DynCom.stgMediumType())
    ),
    shellIdListFormat: formatIdOf(SHELL_ID_LIST_FORMAT_NAME),
    htmlFormat: formatIdOf(HTML_FORMAT_NAME),
    uriFormat: formatIdOf(URL_FORMAT_NAME)
  };
}

// Registered once: the interface by name and the two registered format ids.
function callsOf() {
  cachedCalls ??= makeCalls();
  return cachedCalls;
}

function formatOf(clipboardFormat: number) {
  return DynCom.formatEtc(DynComFormatEtc.hglobal(clipboardFormat));
}

// QueryGetData is not used: dynwinrt reports success for a format the object lacks, GetData reports it.
function isFormatOffered({ data, clipboardFormat }: {
  data: DynWinRTValue;
  clipboardFormat: number;
}) {
  try {
    bytesOf({
      data,
      clipboardFormat
    });
    return true;
  } catch {
    return false;
  }
}

function bytesOf({ data, clipboardFormat }: {
  data: DynWinRTValue;
  clipboardFormat: number;
}) {
  const medium = callsOf().dataObject.method(GET_DATA_SLOT).invoke(data, [formatOf(clipboardFormat)]);
  return DynCom.takeStgMedium(medium).toBuffer();
}

function wideTextOf(bytes: Buffer) {
  const text = bytes.toString("utf16le");
  const end = text.indexOf(WIDE_NULL);
  return end < 0 ? text : text.slice(0, end);
}

/**
 * The paths a `DROPFILES` block holds (what CF_HDROP carries).
 *
 * @param bytes - The block: the offset of the list, the wide flag, then the double-null-terminated list.
 * @returns The paths.
 */
export function pathsOfDropFiles(bytes: Buffer) {
  const start = bytes.readUInt32LE(DROPFILES_PATHS_POINTER);
  const isWide = bytes.readUInt32LE(DROPFILES_WIDE_OFFSET) !== 0;
  const list = bytes.subarray(start).toString(isWide ? "utf16le" : "latin1");
  const doubleEnd = list.indexOf(`${WIDE_NULL}${WIDE_NULL}`);
  const body = doubleEnd < 0 ? list : list.slice(0, doubleEnd);
  return body.split(WIDE_NULL).filter(entry => entry !== "");
}

/**
 * A live view of the data object a drag carries. Valid while the drag is over
 * the target: take a copy (`copyOf`) before the drop returns.
 *
 * @param data - The `IDataObject` of `IDropTarget::DragEnter` or `Drop`.
 * @returns What a zone reads the drag through.
 */
export function readerOf(data: DynWinRTValue) {
  const calls = callsOf();
  // Files come as a list of paths (CF_HDROP) or, from Explorer's address bar, as shell item ids.
  const filesFormats = [CF_HDROP, calls.shellIdListFormat];
  const formatsOfKind = new Map<DataKind, number[]>([
    [DataKind.file, filesFormats],
    [DataKind.directory, filesFormats],
    [DataKind.text, [CF_UNICODETEXT]],
    [DataKind.html, [calls.htmlFormat]],
    [DataKind.uri, [calls.uriFormat]],
    [DataKind.bitmap, []]
  ]);
  const offered = new Map<number, boolean>();
  function read(clipboardFormat: number) {
    return bytesOf({
      data,
      clipboardFormat
    });
  }

  function isOffered(clipboardFormat: number) {
    const isChecked = offered.has(clipboardFormat);
    if (!isChecked) {
      offered.set(
        clipboardFormat, isFormatOffered({
          data,
          clipboardFormat
        })
      );
    }

    return offered.get(clipboardFormat) === true;
  }

  return {
    has: (kind: DataKind) => (formatsOfKind.get(kind) ?? []).some(isOffered),
    text: () => wideTextOf(read(CF_UNICODETEXT)),
    html: () => read(calls.htmlFormat).toString("utf8"),
    uri: () => wideTextOf(read(calls.uriFormat)),
    paths() {
      const hasPathList = isOffered(CF_HDROP);
      return hasPathList ? pathsOfDropFiles(read(CF_HDROP)) : pathsOfShellIdList(read(calls.shellIdListFormat));
    }
  } satisfies OleReader;
}

/**
 * Reads everything a reader offers now, so it can be read after the data
 * object is gone (a drop reads its data after `Drop` returned).
 *
 * @param live - A reader over a data object.
 * @returns A reader over the copy.
 */
export function copyOf(live: OleReader) {
  const kinds = Object.values(DataKind).filter(kind => live.has(kind));
  function has(kind: DataKind) {
    return kinds.includes(kind);
  }

  const text = has(DataKind.text) ? live.text() : "";
  const html = has(DataKind.html) ? live.html() : "";
  const uri = has(DataKind.uri) ? live.uri() : "";
  const paths = has(DataKind.file) ? live.paths() : [];
  return {
    has,
    text: () => text,
    html: () => html,
    uri: () => uri,
    paths: () => paths
  } satisfies OleReader;
}

/**
 * A reader as a `PackageSource`.
 *
 * @param reader - Over a live data object or a copy.
 * @returns The source a zone judges and reads.
 */
export function sourceOfReader(reader: OleReader) {
  return {
    formats: () => [],
    has: kind => reader.has(kind),
    readText: () => Promise.resolve(reader.text()),
    readHtml: () => Promise.resolve(reader.html()),
    readUri: () => Promise.resolve(reader.uri()),
    readFiles: () => Promise.resolve(reader.paths().map(path => nativeFileAt(path))),
    readBitmap: () => Promise.reject(new Error("a dragged picture is not read from another app's drag yet")),
    readCustom: () => Promise.resolve(undefined)
  } satisfies PackageSource;
}
