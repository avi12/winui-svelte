import { pictureTables } from "./picture-spec.ts";

export const PictureKind = {
  LOCAL: "local",
  APPX: "appx",
  DATA: "data",
  REMOTE: "remote",
  NONE: "none"
} as const;
export type PictureKind = (typeof PictureKind)[keyof typeof PictureKind];

const mimes = new Map(pictureTables.formats.map(format => [format.extension, format.mime]));
const WINDOWS_ABSOLUTE = /^[A-Za-z]:\//u;
const EXTENSION = /\.([A-Za-z0-9]+)$/u;
const DATA_MIME = /^data:image\/([a-z0-9.+-]+)/iu;
const MIME_EXTENSIONS = new Map([["x-icon", "ico"], ["vnd.microsoft.icon", "ico"], ["svg+xml", "svg"], ["jpeg", "jpg"]]);

function normalized(value: string) {
  const parts: string[] = [];
  for (const part of value.replaceAll("\\", "/").split("/")) {
    const isUp = part === "..";
    const isInsideRoot = isUp && parts.length > 1;
    if (isInsideRoot) {
      parts.pop();
      continue;
    }

    const isSkipped = part === "." || (isUp && parts.length > 0);
    if (!isSkipped) {
      parts.push(part);
    }
  }

  return parts.join("/");
}

function directoryOf(file: string) {
  const slash = file.replaceAll("\\", "/").lastIndexOf("/");
  return slash <= 0 ? "/" : file.replaceAll("\\", "/").slice(0, slash);
}

function extensionOf(path: string) {
  return EXTENSION.exec(path)?.[1]?.toLowerCase() ?? "";
}

function withoutQuery(value: string) {
  return value.replace(/[?#].*$/u, "");
}

function decoded(value: string) {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

// The file a `file:///` URL names: the drive path as it is, any other as an absolute path.
function pathOfFileUrl(value: string) {
  const rest = decoded(withoutQuery(value.slice(pictureTables.schemes.file.length)));
  return WINDOWS_ABSOLUTE.test(rest) ? rest : `/${rest}`;
}

// The places a path may name, in order: an alias (`$lib/`) under the project, a leading slash first under the
// project's public folder, as a bundler serves it.
function candidatesOf({ path, isAppx, file, root }: {
  path: string;
  isAppx: boolean;
  file: string;
  root: string;
}) {
  const alias = pictureTables.aliases.find(entry => path.startsWith(entry.prefix));
  const isAliased = alias !== undefined && !isAppx;
  if (isAliased) {
    return [normalized(`${root}/${alias.folder}${path.slice(alias.prefix.length)}`)];
  }

  const isDriveAbsolute = WINDOWS_ABSOLUTE.test(path);
  const isRooted = path.startsWith("/");
  const isDrivePath = !isAppx && isDriveAbsolute;
  if (isDrivePath) {
    return [normalized(path)];
  }

  const isRootedPath = !isAppx && isRooted;
  if (isRootedPath) {
    return [
      normalized(`${root}/${pictureTables.publicFolder}${path}`),
      normalized(`${root}${path}`),
      normalized(path)
    ];
  }

  const places = isAppx ? [root, directoryOf(file)] : [directoryOf(file), root];
  return places.map(place => normalized(`${place}/${path}`));
}

/**
 * The extension of the format a MIME subtype names (`svg+xml` is `svg`), or the subtype itself.
 */
export function extensionOfMime(subtype: string) {
  const lowered = subtype.toLowerCase();
  return MIME_EXTENSIONS.get(lowered) ?? lowered;
}

/**
 * The extension a format table knows, for the MIME type.
 */
export function mimeOf(extension: string) {
  return mimes.get(extension);
}

/**
 * Whether a value names something a picture preview draws: a file or URL of an image, or a data URI.
 */
export function isPicture(value: string) {
  return pictureTargetOf({
    value,
    file: "/",
    root: "/"
  }).kind !== PictureKind.NONE;
}

/**
 * What a picture value names: a file (the places to look for it, in order), an `ms-appx:///` file, a `data:` URI, a
 * remote URL, or nothing a picture preview draws (a glyph name, a text).
 */
export function pictureTargetOf({ value, file, root }: {
  value: string;
  file: string;
  root: string;
}) {
  const { schemes } = pictureTables;
  if (value.startsWith(schemes.data)) {
    return {
      kind: PictureKind.DATA,
      extension: extensionOfMime(DATA_MIME.exec(value)?.[1] ?? ""),
      candidates: []
    };
  }

  const isRemote = schemes.remote.some(scheme => value.toLowerCase().startsWith(scheme));
  if (isRemote) {
    return {
      kind: PictureKind.REMOTE,
      extension: extensionOf(withoutQuery(value)),
      candidates: []
    };
  }

  const isFileUrl = value.toLowerCase().startsWith(schemes.file);
  const isAppx = value.startsWith(schemes.appx);
  const stripped = isAppx ? value.slice(schemes.appx.length) : value;
  const path = isFileUrl ? pathOfFileUrl(value) : withoutQuery(stripped).replaceAll("\\", "/");
  const extension = extensionOf(path);
  const isPicture = mimes.has(extension);
  if (!isPicture) {
    return {
      kind: PictureKind.NONE,
      extension: "",
      candidates: []
    };
  }

  return {
    kind: isAppx ? PictureKind.APPX : PictureKind.LOCAL,
    extension,
    candidates: isFileUrl ? [normalized(path)] : candidatesOf({
      path,
      isAppx,
      file,
      root
    })
  };
}
