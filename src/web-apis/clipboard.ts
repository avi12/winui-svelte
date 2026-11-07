import { DomErrorName, domException } from "./dom-exception.ts";
import { HandlerEventTarget } from "./event-handlers.ts";
import { defineNavigatorProperty, defineProperty } from "./install.ts";
import { PermissionName, PermissionStateName, registerPermission } from "./permissions.ts";
import type { ClipboardContent, ClipboardReadOptions } from "#src/data-transfer/clipboard.js";
import { clipboard } from "#src/data-transfer/clipboard.js";
import { DataTransfer, FormatType } from "#src/data-transfer/data-transfer.js";
import type { DeferredProvider } from "#src/data-transfer/data-transfer.js";
import { nativeFileOfBytes } from "#src/data-transfer/native-file.js";
import { snapshotOf } from "#src/data-transfer/package-io.js";
import { sourceOf } from "#src/data-transfer/winrt-package.js";
import { Clipboard as WindowsClipboard } from "#winui/windows/application-model/data-transfer/Clipboard";

const CHANGE_EVENT = "clipboardchange";
const IMAGE_PREFIX = "image/";
const IMAGE_NAME = "image.png";
const WEB_CUSTOM_PREFIX = "web ";
const HISTORY_SUCCESS = 0;
const TEXT_TYPES = [FormatType.text, FormatType.html, FormatType.uri];

/** What a clipboard read gives: the formats, the text formats and the files. */
export type ClipboardData = Pick<DataTransfer, "types" | "files" | "getData">;

/** What the clipboard Web APIs run on; the tests give a fake. */
export interface ClipboardBackend {
  read(options?: ClipboardReadOptions): Promise<ClipboardData>;
  write(content: ClipboardContent): Promise<void>;
  onChange(callback: () => void): () => void;
  history(): Promise<ClipboardData[]>;
}

/**
 * The Windows clipboard, over the `clipboard` of `data-transfer` and the
 * clipboard history of `Windows.ApplicationModel.DataTransfer`.
 *
 * @returns The backend the real install uses.
 */
export function windowsClipboardBackend() {
  return {
    read: options => clipboard.read(options),
    write: content => clipboard.write(content),
    onChange: callback => clipboard.onChange(callback),
    async history() {
      const isEnabled = WindowsClipboard.isHistoryEnabled();
      if (!isEnabled) {
        return [];
      }

      const result = await WindowsClipboard.getHistoryItemsAsync();
      const isFailed = Number(result.status) !== HISTORY_SUCCESS;
      if (isFailed) {
        return [];
      }

      const items = result.items?.toArray() ?? [];
      return Promise.all(
        items.map(async item => new DataTransfer(await snapshotOf({
          source: sourceOf(item.content),
          customFormats: []
        })))
      );
    }
  } satisfies ClipboardBackend;
}

/** What `ClipboardItem` is made from: a `Blob`, text or a promise of either, per type. */
export type ClipboardItemData = Record<string, Blob | string | Promise<Blob | string>>;

// The types of an item whose value is a promise: `write` hands those to the clipboard unresolved.
const promisedTypes = new WeakMap<object, ReadonlySet<string>>();

/** The standard `ClipboardItem`: one value per media type. */
export class ClipboardItem {
  readonly presentationStyle: "unspecified" | "inline" | "attachment";
  private readonly entries: ClipboardItemData;

  /**
   * Makes an item.
   *
   * @param items - The value of each type.
   * @param options - How the item is presented.
   * @throws {TypeError} When no type is given.
   */
  constructor(items: ClipboardItemData, options: {
    presentationStyle?: "unspecified" | "inline" | "attachment";
  } = {}) {
    const isEmpty = Object.keys(items).length === 0;
    if (isEmpty) {
      throw new TypeError("Failed to construct 'ClipboardItem': At least one entry required");
    }

    this.entries = items;
    promisedTypes.set(
      this,
      new Set(Object.entries(items).filter(([, value]) => value instanceof Promise).map(([type]) => type))
    );
    this.presentationStyle = options.presentationStyle ?? "unspecified";
  }

  /** The types the item holds. */
  get types() {
    return Object.keys(this.entries);
  }

  /**
   * The value of one type.
   *
   * @param type - A type from `types`.
   * @returns A blob of that type.
   * @throws {DOMException} `NotFoundError` when the item has no such type.
   */
  async getType(type: string) {
    const value = this.entries[type];
    const isMissing = value === undefined;
    if (isMissing) {
      throw domException({
        name: DomErrorName.NOT_FOUND,
        message: "Failed to execute 'getType' on 'ClipboardItem': The type was not found"
      });
    }

    const resolved = await value;
    return typeof resolved === "string" ? new Blob([resolved], { type }) : resolved;
  }

  /**
   * Whether the clipboard takes a type.
   *
   * @param type - A media type.
   * @returns True for text, HTML, URL lists, images and `web ` custom formats.
   */
  static supports(type: string) {
    const isImage = type.startsWith(IMAGE_PREFIX);
    const isText = TEXT_TYPES.some(known => known === type);
    return isImage || isText || type.startsWith(WEB_CUSTOM_PREFIX);
  }

  get [Symbol.toStringTag]() {
    return "ClipboardItem";
  }
}

async function valueOf({ item, type }: {
  item: ClipboardItem;
  type: string;
}) {
  const blob = await item.getType(type);
  const isImage = type.startsWith(IMAGE_PREFIX);
  if (isImage) {
    return nativeFileOfBytes({
      name: IMAGE_NAME,
      type,
      content: new Uint8Array(await blob.arrayBuffer())
    });
  }

  return blob.text();
}

function valueProvider(options: {
  item: ClipboardItem;
  type: string;
}) {
  return () => valueOf(options);
}

// The format id a type is put under: custom types lose their `web ` prefix.
function formatOf(type: string) {
  const isCustom = type.startsWith(WEB_CUSTOM_PREFIX);
  return isCustom ? type.slice(WEB_CUSTOM_PREFIX.length) : type;
}

async function contentOf(item: ClipboardItem) {
  const content: ClipboardContent = {};
  const custom: Record<string, string> = {};
  const deferred: Record<string, DeferredProvider> = {};
  for (const type of item.types) {
    const isSupported = ClipboardItem.supports(type);
    if (!isSupported) {
      throw domException({
        name: DomErrorName.NOT_ALLOWED,
        message: `Failed to execute 'write' on 'Clipboard': Type ${type} is not supported`
      });
    }

    const provider = valueProvider({
      item,
      type
    });
    const isPromised = promisedTypes.get(item)?.has(type) === true;
    if (isPromised) {
      deferred[formatOf(type)] = provider;
      continue;
    }

    const value = await provider();
    const isPicture = typeof value !== "string";
    if (isPicture) {
      content.bitmap = value;
    } else if (type === FormatType.text) {
      content.text = value;
    } else if (type === FormatType.html) {
      content.html = value;
    } else if (type === FormatType.uri) {
      content.uri = value;
    } else {
      custom[formatOf(type)] = value;
    }
  }

  const hasCustom = Object.keys(custom).length > 0;
  const hasDeferred = Object.keys(deferred).length > 0;
  return {
    ...content,
    ...hasCustom ? { custom } : {},
    ...hasDeferred ? { deferred } : {}
  } satisfies ClipboardContent;
}

async function itemOf(data: ClipboardData) {
  const entries: ClipboardItemData = {};
  for (const type of TEXT_TYPES) {
    const isOffered = data.types.includes(type);
    if (isOffered) {
      entries[type] = data.getData(type);
    }
  }

  const picture = data.files.find(file => file.type.startsWith(IMAGE_PREFIX) && file.path === "");
  if (picture) {
    entries[picture.type] = new Blob([await picture.bytes()], { type: picture.type });
  }

  const isEmpty = Object.keys(entries).length === 0;
  return isEmpty ? undefined : new ClipboardItem(entries);
}

/**
 * What Windows adds to `navigator.clipboard`; a browser has none of it. They
 * autocomplete only where this module is imported.
 */
export interface ClipboardExtras {
  /**
   * Everything on the clipboard, formats beyond text, HTML and pictures
   * included: copied files in `files`, the custom formats named in `formats`
   * read as text.
   */
  readContent(options?: ClipboardReadOptions): Promise<ClipboardData>;

  /**
   * Replaces the clipboard's content with files, custom formats, a picture
   * and more; `shouldPersist` keeps it after the app exits.
   */
  writeContent(content: ClipboardContent): Promise<void>;

  /** The formats on the clipboard, without reading them. */
  formats(): Promise<readonly string[]>;

  /** The Windows clipboard history (Win+V), newest first; empty when history is off. */
  history(): Promise<readonly ClipboardData[]>;
}

declare global {
  // The extras join the standard Clipboard wherever this module is imported.

  interface Clipboard extends ClipboardExtras {
    onclipboardchange: EventListener | null;
  }
}

/** The `navigator.clipboard` object. */
export class Clipboard extends HandlerEventTarget implements ClipboardExtras {
  private readonly backend: ClipboardBackend;

  /** Made by `installClipboard`. */
  constructor(backend: ClipboardBackend) {
    super();
    this.backend = backend;
  }

  get onclipboardchange() {
    return this.getHandler(CHANGE_EVENT);
  }

  set onclipboardchange(handler: EventListener | null) {
    this.setHandler({
      type: CHANGE_EVENT,
      handler
    });
  }

  /** The text on the clipboard; empty when it holds none. */
  async readText() {
    const data = await this.backend.read();
    const hasText = data.types.includes(FormatType.text);
    return hasText ? data.getData(FormatType.text) : "";
  }

  /** Replaces the clipboard's content with text. */
  writeText(text: string) {
    return this.backend.write({ text });
  }

  /** The clipboard's content as one `ClipboardItem`; none when it holds nothing a web page reads. */
  async read() {
    const item = await itemOf(await this.backend.read());
    return item === undefined ? [] : [item];
  }

  /**
   * Replaces the clipboard's content.
   *
   * @param items - One `ClipboardItem`.
   * @throws {DOMException} `NotAllowedError` for more than one item or a type the clipboard cannot take.
   */
  async write(items: readonly ClipboardItem[]) {
    const [item] = items;
    const isSingle = items.length === 1 && item !== undefined;
    if (!isSingle) {
      throw domException({
        name: DomErrorName.NOT_ALLOWED,
        message: "Failed to execute 'write' on 'Clipboard': Support for multiple ClipboardItems is not implemented"
      });
    }

    await this.backend.write(await contentOf(item));
  }

  readContent(options?: ClipboardReadOptions) {
    return this.backend.read(options);
  }

  writeContent(content: ClipboardContent) {
    return this.backend.write(content);
  }

  async formats() {
    return (await this.backend.read()).types;
  }

  history() {
    return this.backend.history();
  }

  get [Symbol.toStringTag]() {
    return "Clipboard";
  }
}

/** What `installClipboard` takes. */
export interface ClipboardInstallOptions {
  /** Stands in for the Windows clipboard; the tests give one. */
  readonly backend?: ClipboardBackend;
}

/**
 * Defines `navigator.clipboard` (`read`, `write`, `readText`, `writeText` and
 * the `clipboardchange` event), the global `ClipboardItem`, and the
 * `clipboard-read` and `clipboard-write` permissions (always granted: Windows
 * lets the foreground app use the clipboard). Call it on the window thread.
 *
 * @param options - The backend, for tests.
 * @returns The function that takes them away again.
 */
export function installClipboard(options: ClipboardInstallOptions = {}) {
  const backend = options.backend ?? windowsClipboardBackend();
  const instance = new Clipboard(backend);
  const uninstalls = [
    backend.onChange(() => {
      instance.dispatchEvent(new Event(CHANGE_EVENT));
    }),
    defineNavigatorProperty({
      name: "clipboard",
      value: instance
    }),
    defineProperty({
      name: "ClipboardItem",
      value: ClipboardItem
    }),
    ...[PermissionName.CLIPBOARD_READ, PermissionName.CLIPBOARD_WRITE].map(name => registerPermission({
      name,
      provider: {
        state: () => PermissionStateName.GRANTED
      }
    }))
  ];
  return () => {
    for (const uninstall of uninstalls.reverse()) {
      uninstall();
    }
  };
}
