import { DataKind } from "./accept.ts";
import type { DataTransfer } from "./data-transfer.ts";
import { FormatType } from "./data-transfer.ts";
import type { DeferredProvider } from "./data-transfer.ts";
import { htmlFormatOf } from "./html-format.ts";
import { imageTypeOf } from "./mime.ts";
import { FileKind, nativeFileAt, nativeFileOfBytes } from "./native-file.ts";
import type { NativeFile } from "./native-file.ts";
import { fillPackage, isImageType, uriOfList } from "./package-io.ts";
import type { PackageSource, PackageTarget } from "./package-io.ts";
import { streamOf } from "#src/components/byte-stream.js";
import { unboxed } from "#src/renderer/host/values.js";
import { PropertyValue, Uri } from "#src/winui.js";
import { DataPackage } from "#winui/windows/application-model/data-transfer/DataPackage";
import type { DataPackageView } from "#winui/windows/application-model/data-transfer/DataPackageView";
import type { DataProviderRequest } from "#winui/windows/application-model/data-transfer/DataProviderRequest";
import { StandardDataFormats } from "#winui/windows/application-model/data-transfer/StandardDataFormats";
import { StorageFile } from "#winui/windows/storage/StorageFile";
import { StorageFolder } from "#winui/windows/storage/StorageFolder";
import { DataReader } from "#winui/windows/storage/streams/DataReader";
import type { IInputStream } from "#winui/windows/storage/streams/IInputStream";
import { RandomAccessStreamReference } from "#winui/windows/storage/streams/RandomAccessStreamReference";

const READ_CHUNK_BYTES = 65_536;
const BITMAP_NAME = "image";

// The formats each kind is asked for with.
const FORMAT_OF_KIND = {
  [DataKind.text]: StandardDataFormats.text,
  [DataKind.html]: StandardDataFormats.html,
  [DataKind.uri]: StandardDataFormats.uri,
  [DataKind.bitmap]: StandardDataFormats.bitmap,
  [DataKind.file]: StandardDataFormats.storageItems,
  [DataKind.directory]: StandardDataFormats.storageItems
} as const satisfies Record<DataKind, string>;

async function bytesOfBitmap(view: DataPackageView) {
  const reference = await view.getBitmapAsync();
  const stream = await reference.openReadAsync();
  const reader = new DataReader(stream as unknown as IInputStream);
  const chunks: Uint8Array[] = [];
  for (;;) {
    const loaded = await reader.loadAsync(READ_CHUNK_BYTES);
    const isEnd = loaded === 0;
    if (isEnd) {
      break;
    }

    // The generated type says Buffer; dynwinrt gives the bytes as a Node.js Buffer.
    const chunk: unknown = reader.readBytes(new Uint8Array(loaded));
    const isBytes = chunk instanceof Uint8Array;
    if (isBytes) {
      chunks.push(chunk);
    }
  }

  return Buffer.concat(chunks);
}

/**
 * A package view as a `PackageSource`.
 *
 * @param view - What a drop or the clipboard holds.
 * @returns The source to read it through.
 */
export function sourceOf(view: DataPackageView) {
  return {
    formats: () => view.availableFormats?.toArray() ?? [],
    has: kind => view.contains(FORMAT_OF_KIND[kind]),
    readText: () => view.getTextAsync(),
    readHtml: () => view.getHtmlFormatAsync(),
    async readUri() {
      const uri = view.contains(StandardDataFormats.webLink) ? await view.getWebLinkAsync() : await view.getUriAsync();
      return uri.absoluteUri;
    },
    async readFiles() {
      const items = (await view.getStorageItemsAsync())?.toArray() ?? [];
      const paths = items.map(item => item.path).filter(itemPath => itemPath !== "");
      return paths.map(nativeFileAt);
    },
    async readBitmap() {
      const content = await bytesOfBitmap(view);
      return nativeFileOfBytes({
        name: BITMAP_NAME,
        type: imageTypeOf(content),
        content
      });
    },
    async readCustom(format) {
      const value = unboxed(await view.getDataAsync(format));
      return typeof value === "string" ? value : undefined;
    }
  } satisfies PackageSource;
}

async function referenceOf(file: NativeFile) {
  const hasPath = file.path !== "";
  if (hasPath) {
    return RandomAccessStreamReference.createFromFile(await StorageFile.getFileFromPathAsync(file.path));
  }

  return RandomAccessStreamReference.createFromStream(await streamOf(await file.bytes()));
}

function formatOfType(type: string) {
  const formats = new Map<string, string>([
    [FormatType.text, StandardDataFormats.text],
    [FormatType.html, StandardDataFormats.html],
    [FormatType.uri, StandardDataFormats.uri]
  ]);
  return formats.get(type) ?? (isImageType(type) ? StandardDataFormats.bitmap : type);
}

// What `DataProviderRequest.setData` takes for the format a type maps to.
async function providedValue({ type, value }: {
  type: string;
  value: string | NativeFile;
}) {
  const isFile = typeof value !== "string";
  if (isFile) {
    return referenceOf(value);
  }

  switch (type) {
    case FormatType.text:
      return value;
    case FormatType.html:
      return htmlFormatOf(value);
    case FormatType.uri:
      return new Uri(uriOfList(value));
    default:
      return PropertyValue.createString(value);
  }
}

// A provider that fails leaves the request without data: the paste or drop gets nothing for that format.
async function provide({ request, type, provider }: {
  request: DataProviderRequest;
  type: string;
  provider: DeferredProvider;
}) {
  const deferral = request.getDeferral();
  try {
    request.setData(
      await providedValue({
        type,
        value: await provider()
      })
    );
  } catch {
    // Left empty, as above.
  } finally {
    deferral.complete();
  }
}

/**
 * A package as a `PackageTarget`.
 *
 * @param data - The package a drag or the clipboard will carry.
 * @returns The target to fill it through.
 */
export function targetOf(data: DataPackage) {
  return {
    setText: text => data.setText(text),
    setHtml: fragment => data.setHtmlFormat(htmlFormatOf(fragment)),
    setUri: uri => data.setUri(new Uri(uri)),
    setCustom: ({ format, value }) => data.setData(format, PropertyValue.createString(value)),
    async setFiles(files) {
      const items = await Promise.all(
        files.map(file => {
          const isFolder = file.kind === FileKind.directory;
          if (isFolder) {
            return StorageFolder.getFolderFromPathAsync(file.path);
          }

          return StorageFile.getFileFromPathAsync(file.path);
        })
      );
      data.setStorageItems(items);
    },
    async setBitmap(file) {
      data.setBitmap(await referenceOf(file));
    },
    setDeferred({ type, provider }) {
      data.setDataProvider(formatOfType(type), request => {
        provide({
          request,
          type,
          provider
        }).catch(() => undefined);
      });
    }
  } satisfies PackageTarget;
}

/**
 * A data package holding what a `DataTransfer` holds.
 *
 * @param transfer - The data to put in the package.
 * @returns The filled `DataPackage`.
 */
export async function dataPackageOf(transfer: DataTransfer) {
  const data = new DataPackage();
  await fillPackage({
    transfer,
    target: targetOf(data)
  });
  return data;
}
