import { extensionOfMime, mimeOf } from "./picture-paths.ts";
import { pictureTables } from "./picture-spec.ts";

const HTTP_SCHEMES = new Set(["http:", "https:"]);
const LINK_LOCAL_HOST = /^(169\.254\.|\[fe80:)/iu;
const GENERIC_TYPES = new Set(["application/octet-stream", "binary/octet-stream"]);
const SVG_ROOT = /<svg[\s>]/iu;
const SVG_SCAN_BYTES = 1024;
const IMAGE_PREFIX = "image/";

/**
 * Whether a remote picture may be fetched at all: an http or https URL of a sane length, with a host, with no
 * credentials in it and not aimed at a link-local address (cloud metadata services live there).
 */
export function isFetchableUrl(value: string) {
  const url = URL.parse(value);
  const isTooLong = value.length > pictureTables.remote.maxUrlLength;
  const isUnparsable = url === null;
  const isRefused = isUnparsable || isTooLong;
  if (isRefused) {
    return false;
  }

  const hasCredentials = url.username !== "" || url.password !== "";
  const hasHost = url.hostname !== "";
  const isLinkLocal = LINK_LOCAL_HOST.test(url.host);
  return HTTP_SCHEMES.has(url.protocol) && hasHost && !hasCredentials && !isLinkLocal;
}

/**
 * Where a redirect leads: the absolute URL, or none when it is not fetchable or drops from https to http.
 */
export function redirectTarget({ from, location }: {
  from: string;
  location: string;
}) {
  const target = URL.parse(location, from);
  const isUnparsable = target === null;
  if (isUnparsable) {
    return undefined;
  }

  const isDowngrade = URL.parse(from)?.protocol === "https:" && target.protocol === "http:";
  const isAllowed = !isDowngrade && isFetchableUrl(target.href);
  return isAllowed ? target.href : undefined;
}

function hasSignature({ bytes, offset, hex }: {
  bytes: Uint8Array;
  offset: number;
  hex: string;
}) {
  const wanted = Buffer.from(hex, "hex");
  const actual = Buffer.from(bytes.subarray(offset, offset + wanted.length));
  return actual.equals(wanted);
}

/**
 * The extension of a fetched picture, from what is the most certain: its first bytes, then the response's content
 * type, then (only when the type is missing or generic) the extension the URL ends with. None when nothing says it
 * is a picture, such as an HTML page.
 */
export function sniffExtension({ bytes, contentType, urlExtension }: {
  bytes: Uint8Array;
  contentType: string;
  urlExtension: string;
}) {
  const signed = pictureTables.signatures.find(signature => hasSignature({
    bytes,
    offset: signature.offset,
    hex: signature.hex
  }));
  if (signed) {
    return signed.extension;
  }

  const head = new TextDecoder().decode(bytes.subarray(0, SVG_SCAN_BYTES));
  if (SVG_ROOT.test(head)) {
    return "svg";
  }

  const type = (contentType.split(";")[0] ?? "").trim().toLowerCase();
  const fromType = extensionOfMime(type.slice(IMAGE_PREFIX.length));
  const isKnownImageType = type.startsWith(IMAGE_PREFIX) && mimeOf(fromType) !== undefined;
  if (isKnownImageType) {
    return fromType;
  }

  const isUnspecific = type === "" || GENERIC_TYPES.has(type);
  const isKnownUrlExtension = mimeOf(urlExtension) !== undefined;
  const isUrlTheBest = isUnspecific && isKnownUrlExtension;
  return isUrlTheBest ? urlExtension : "";
}
