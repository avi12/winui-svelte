import { DataKind } from "./accept.ts";
import { DataTransfer, FormatType } from "./data-transfer.ts";
import type { NativeFile } from "./native-file.ts";
import { fillPackage, previewOf, snapshotOf } from "./package-io.ts";
import { sourceOf, targetOf } from "./winrt-package.ts";
import { Clipboard } from "#winui/windows/application-model/data-transfer/Clipboard";
import { DataPackage } from "#winui/windows/application-model/data-transfer/DataPackage";

/** What `clipboard.write` puts on the clipboard. */
export interface ClipboardContent {
  text?: string;
  /** An HTML fragment; the clipboard format around it is made for you. */
  html?: string;
  uri?: string;
  /** Files and folders, to paste in Explorer. */
  files?: readonly NativeFile[];
  /** A picture. */
  bitmap?: NativeFile;
  /** Text under custom format ids. */
  custom?: Readonly<Record<string, string>>;
  /** Keep the content after the app exits (can fail when the window is not focused). Default false. */
  shouldPersist?: boolean;
}

/** What `clipboard.read` reads. */
export interface ClipboardReadOptions {
  /** Custom format ids to read as text. */
  formats?: readonly string[];
}

function currentSource() {
  return sourceOf(Clipboard.getContent());
}

function dataTransferOf(content: ClipboardContent) {
  const transfer = new DataTransfer();
  const values = [
    [FormatType.text, content.text],
    [FormatType.html, content.html],
    [FormatType.uri, content.uri]
  ] as const;
  for (const [type, value] of values) {
    const hasValue = value !== undefined;
    if (hasValue) {
      transfer.setData(type, value);
    }
  }

  for (const [format, value] of Object.entries(content.custom ?? {})) {
    transfer.setData(format, value);
  }

  for (const file of content.files ?? []) {
    transfer.addFile(file);
  }

  transfer.bitmap = content.bitmap;
  return transfer;
}

/** The text on the clipboard; empty when it holds none. */
async function readText() {
  const source = currentSource();
  return source.has(DataKind.text) ? source.readText() : "";
}

/** Replaces the clipboard's content. */
async function write(content: ClipboardContent) {
  const data = new DataPackage();
  await fillPackage({
    transfer: dataTransferOf(content),
    target: targetOf(data)
  });
  Clipboard.setContent(data);

  if (content.shouldPersist) {
    Clipboard.flush();
  }
}

/**
 * The system clipboard, over `Windows.ApplicationModel.DataTransfer.Clipboard`.
 * It works from an unpackaged app on the UI thread. Nothing changes the
 * clipboard but `write`, `writeText` and `clear`.
 */
export const clipboard = {
  /** The text on the clipboard; empty when it holds none. */
  readText,
  /** The HTML fragment on the clipboard; empty when it holds none. */
  async readHtml() {
    const source = currentSource();
    const snapshot = await snapshotOf({
      source,
      customFormats: []
    });
    return snapshot.strings.get(FormatType.html) ?? "";
  },
  /**
   * Everything on the clipboard, as the data of a paste: `types`, `getData`,
   * `files` (a copied file is a `NativeFile`, a copied picture one with no
   * path).
   */
  async read(options: ClipboardReadOptions = {}) {
    const snapshot = await snapshotOf({
      source: currentSource(),
      customFormats: options.formats ?? []
    });
    return new DataTransfer(snapshot);
  },
  /** The formats on the clipboard, without reading them. */
  types() {
    return previewOf(currentSource()).types;
  },
  /** Replaces the clipboard's content with text. */
  writeText(text: string) {
    return write({ text });
  },
  /** Replaces the clipboard's content. */
  write,
  /** Empties the clipboard. */
  clear() {
    Clipboard.clear();
  },
  /**
   * Calls back each time the clipboard's content changes, whoever changed it.
   *
   * @returns What stops the calls.
   */
  onChange(callback: () => void) {
    const token = Clipboard.add_ContentChanged(callback);
    return () => Clipboard.remove_ContentChanged(token);
  }
};
