const DATA_PREFIX = "data:";
const BASE64_MARK = ";base64";
const DEFAULT_TYPE = "text/plain";

/** What a `data:` URI holds. */
export interface DataUriContent {
  /** The media type, such as `image/svg+xml`. */
  mimeType: string;

  /** The decoded bytes. */
  bytes: Uint8Array;
}

/**
 * Whether a string is a `data:` URI.
 */
export function isDataUri(text: string) {
  return text.trimStart().toLowerCase().startsWith(DATA_PREFIX);
}

/**
 * Decodes a `data:` URI, base64 or percent-encoded. WinUI's image and media
 * sources take no `data:` URIs, so the bytes are what an app hands them.
 *
 * @throws {Error} When the text has no comma after the media type.
 */
export function decodeDataUri(uri: string) {
  const body = uri.trim().slice(DATA_PREFIX.length);
  const comma = body.indexOf(",");
  const isFormed = comma >= 0;
  if (!isFormed) {
    throw new Error("a data URI needs a comma after its media type");
  }

  const header = body.slice(0, comma);
  const payload = body.slice(comma + 1);
  const isBase64 = header.toLowerCase().endsWith(BASE64_MARK);
  const [mimeType = ""] = header.split(";");
  const bytes = isBase64
    ? Uint8Array.from(atob(decodeURIComponent(payload)), character => character.codePointAt(0) ?? 0)
    : new TextEncoder().encode(decodeURIComponent(payload));
  return {
    mimeType: mimeType === "" ? DEFAULT_TYPE : mimeType,
    bytes
  } satisfies DataUriContent;
}
