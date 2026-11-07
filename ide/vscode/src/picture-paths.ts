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

/**
 * The extension a format table knows, for the MIME type.
 */
export function mimeOf(extension: string) {
  return mimes.get(extension);
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
    const mime = DATA_MIME.exec(value)?.[1]?.toLowerCase() ?? "";
    return {
      kind: PictureKind.DATA,
      extension: MIME_EXTENSIONS.get(mime) ?? mime,
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

  const isAppx = value.startsWith(schemes.appx);
  const path = withoutQuery(isAppx ? value.slice(schemes.appx.length) : value).replaceAll("\\", "/");
  const extension = extensionOf(path);
  const isPicture = mimes.has(extension);
  if (!isPicture) {
    return {
      kind: PictureKind.NONE,
      extension: "",
      candidates: []
    };
  }

  const isAbsolute = path.startsWith("/") || WINDOWS_ABSOLUTE.test(path);
  const isFromRoot = isAbsolute && !isAppx;
  const places = isAppx ? [root, directoryOf(file)] : [directoryOf(file), root];
  return {
    kind: isAppx ? PictureKind.APPX : PictureKind.LOCAL,
    extension,
    candidates: isFromRoot ? [normalized(path)] : places.map(place => normalized(`${place}/${path}`))
  };
}
