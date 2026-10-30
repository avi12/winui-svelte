// The media types the data transfer knows by file extension: a dropped file's
// `type`, and the extensions a picker is given for an `accept` of media types.
const MEDIA_TYPES = new Map([
  [".txt", "text/plain"],
  [".md", "text/markdown"],
  [".csv", "text/csv"],
  [".html", "text/html"],
  [".htm", "text/html"],
  [".css", "text/css"],
  [".js", "text/javascript"],
  [".mjs", "text/javascript"],
  [".json", "application/json"],
  [".xml", "application/xml"],
  [".pdf", "application/pdf"],
  [".zip", "application/zip"],
  [".png", "image/png"],
  [".jpg", "image/jpeg"],
  [".jpeg", "image/jpeg"],
  [".gif", "image/gif"],
  [".webp", "image/webp"],
  [".bmp", "image/bmp"],
  [".svg", "image/svg+xml"],
  [".ico", "image/x-icon"],
  [".mp3", "audio/mpeg"],
  [".wav", "audio/wav"],
  [".ogg", "audio/ogg"],
  [".flac", "audio/flac"],
  [".mp4", "video/mp4"],
  [".webm", "video/webm"],
  [".mov", "video/quicktime"],
  [".mkv", "video/x-matroska"]
]);

const WILDCARD_SUFFIX = "/*";

/**
 * The media type of a file name, by its extension.
 *
 * @param name - The file name or path.
 * @returns The media type, empty when the extension is not known (as the web's `File.type`).
 */
export function mediaTypeOf(name: string) {
  const dot = name.lastIndexOf(".");
  const isWithoutExtension = dot < 0;
  if (isWithoutExtension) {
    return "";
  }

  return MEDIA_TYPES.get(name.slice(dot).toLowerCase()) ?? "";
}

/**
 * Whether a media type is one an `accept` entry names (`image/png`, `image/*`).
 *
 * @param options - The pattern and the media type, both lower case.
 * @returns True when the type matches.
 */
export function isMediaTypeMatch({ pattern, type }: {
  pattern: string;
  type: string;
}) {
  const isWildcard = pattern.endsWith(WILDCARD_SUFFIX);
  if (isWildcard) {
    return type.startsWith(pattern.slice(0, -1));
  }

  return pattern === type;
}

/**
 * The extensions a media type (or `image/*`) covers: what a picker is given.
 *
 * @param pattern - The media type or wildcard.
 * @returns The extensions with their dot.
 */
export function extensionsOf(pattern: string) {
  const extensions: string[] = [];
  for (const [extension, type] of MEDIA_TYPES) {
    if (isMediaTypeMatch({
      pattern,
      type
    })) {
      extensions.push(extension);
    }
  }

  return extensions;
}

// The first bytes of each image format, in hex.
const SIGNATURES = [
  ["89504e47", "image/png"],
  ["ffd8ff", "image/jpeg"],
  ["474946", "image/gif"],
  ["424d", "image/bmp"]
] as const;
const LONGEST_SIGNATURE_BYTES = 4;

/**
 * The image format a byte sequence starts as.
 *
 * @param bytes - The file's first bytes.
 * @returns The media type; PNG when the signature is not known.
 */
export function imageTypeOf(bytes: Uint8Array) {
  const start = Buffer.from(bytes.subarray(0, LONGEST_SIGNATURE_BYTES)).toString("hex");
  const found = SIGNATURES.find(([signature]) => start.startsWith(signature));
  return found?.[1] ?? "image/png";
}
