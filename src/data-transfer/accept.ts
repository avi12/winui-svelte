import { extensionsOf, isMediaTypeMatch } from "./mime.ts";
import { FileKind } from "./native-file.ts";
import type { NativeFile } from "./native-file.ts";

/** What a drag or the clipboard can carry. */
export const DataKind = {
  file: "file",
  directory: "directory",
  text: "text",
  html: "html",
  uri: "uri",
  bitmap: "bitmap"
} as const;

/** One of `DataKind`'s values. */
export type DataKind = (typeof DataKind)[keyof typeof DataKind];

/**
 * What an `accept` takes, like `<input accept>` of the web: extensions
 * (`".png"`), media types (`"image/*"`, `"text/plain"`) and the kinds of
 * `DataKind` (`"directory"`, `"text"`), as one comma-separated string or a
 * list. Left out or empty, everything is accepted.
 */
export type Accept = string | readonly string[];

interface ParsedAccept {
  extensions: string[];
  mediaTypes: string[];
  kinds: Set<string>;
}

type NonFileKind = Exclude<DataKind, "file" | "directory">;

const MEDIA_TYPE_OF_KIND = {
  [DataKind.text]: "text/plain",
  [DataKind.html]: "text/html",
  [DataKind.uri]: "text/uri-list",
  [DataKind.bitmap]: "image/png"
} as const satisfies Record<NonFileKind, string>;

function parse(accept: Accept | undefined) {
  const tokens = typeof accept === "string" ? accept.split(",") : accept ?? [];
  const parsed: ParsedAccept = {
    extensions: [],
    mediaTypes: [],
    kinds: new Set()
  };
  for (const token of tokens) {
    const entry = token.trim().toLowerCase();
    const isExtension = entry.startsWith(".");
    const isMediaType = entry.includes("/");
    if (isExtension) {
      parsed.extensions.push(entry);
    } else if (isMediaType) {
      parsed.mediaTypes.push(entry);
    } else if (entry !== "") {
      parsed.kinds.add(entry);
    }
  }

  return parsed;
}

function hasFileFilters(parsed: ParsedAccept) {
  return parsed.extensions.length + parsed.mediaTypes.length > 0;
}

function isEmpty(parsed: ParsedAccept) {
  return !hasFileFilters(parsed) && parsed.kinds.size === 0;
}

function isTypeNamed({ parsed, type }: {
  parsed: ParsedAccept;
  type: string;
}) {
  return parsed.mediaTypes.some(pattern => isMediaTypeMatch({
    pattern,
    type
  }));
}

function isNonFileKind(kind: DataKind): kind is NonFileKind {
  return kind in MEDIA_TYPE_OF_KIND;
}

/**
 * Whether a file or folder passes the filter.
 *
 * @param options - The `accept` and the item.
 * @returns True when the item passes.
 */
export function isFileAccepted({ accept, file }: {
  accept: Accept | undefined;
  file: Pick<NativeFile, "name" | "type" | "kind">;
}) {
  const parsed = parse(accept);
  const isAnything = isEmpty(parsed);
  if (isAnything) {
    return true;
  }

  const isFolder = file.kind === FileKind.directory;
  if (isFolder) {
    return parsed.kinds.has(DataKind.directory);
  }

  const lowerName = file.name.toLowerCase();
  const isExtensionMatch = parsed.extensions.some(extension => lowerName.endsWith(extension));
  const isTypeMatch = isTypeNamed({
    parsed,
    type: file.type
  });
  const isFileKindNamed = parsed.kinds.has(DataKind.file);
  return isFileKindNamed || isExtensionMatch || isTypeMatch;
}

/**
 * Whether a kind of data could pass the filter: what a drag can be judged by
 * before it is dropped (the files' names are only known on the drop).
 *
 * @param options - The `accept` and the kind of data.
 * @returns True when something of that kind may pass.
 */
export function isKindAccepted({ accept, kind }: {
  accept: Accept | undefined;
  kind: DataKind;
}) {
  const parsed = parse(accept);
  const isAnything = isEmpty(parsed);
  if (isAnything) {
    return true;
  }

  if (isNonFileKind(kind)) {
    const isKindNamed = parsed.kinds.has(kind);
    return isKindNamed || isTypeNamed({
      parsed,
      type: MEDIA_TYPE_OF_KIND[kind]
    });
  }

  const isKindNamed = parsed.kinds.has(kind) || parsed.kinds.has(DataKind.file) && kind === DataKind.file;
  return isKindNamed || hasFileFilters(parsed) && kind === DataKind.file;
}

/**
 * The extensions a file picker is given for an `accept`: its extensions and
 * those of its media types.
 *
 * @param accept - The filter.
 * @returns The extensions with their dot; empty when the filter names none (every file).
 */
export function pickerExtensionsOf(accept: Accept | undefined) {
  const parsed = parse(accept);
  return [...new Set([...parsed.extensions, ...parsed.mediaTypes.flatMap(extensionsOf)])];
}

/**
 * Whether the filter names folders and nothing else: a picker then picks a folder.
 *
 * @param accept - The filter.
 * @returns True for a folders-only filter.
 */
export function isFoldersOnly(accept: Accept | undefined) {
  const parsed = parse(accept);
  const isFileNamed = parsed.kinds.has(DataKind.file) || hasFileFilters(parsed);
  return parsed.kinds.has(DataKind.directory) && !isFileNamed;
}
