import {
  bestFrameIndex,
  byteSizeText,
  iconFrames,
  imageSizeOf,
  singleFrameIcon
} from "./picture-image.ts";
import { mimeOf, PictureKind, pictureTargetOf } from "./picture-paths.ts";
import { pictureTables } from "./picture-spec.ts";
import { createHash } from "node:crypto";
import { mkdir, readFile, stat, writeFile } from "node:fs/promises";
import path from "node:path";

export const PictureState = {
  SHOWN: "shown",
  MISSING: "missing",
  TOO_LARGE: "tooLarge",
  REMOTE_OFF: "remoteOff",
  REMOTE_FAILED: "remoteFailed"
} as const;
export type PictureState = (typeof PictureState)[keyof typeof PictureState];

const MILLIS_PER_HOUR = 3_600_000;
const BASE64 = "base64";
const ICO = "ico";
const SVG = "svg";

async function exists(file: string) {
  return stat(file).then(info => info.isFile() ? info : undefined, () => undefined);
}

async function fromCache({ cacheFolder, url }: {
  cacheFolder: string;
  url: string;
}) {
  const file = path.join(cacheFolder, createHash("sha1").update(url).digest("hex"));
  const info = await exists(file);
  const isFresh = info !== undefined && Date.now() - info.mtimeMs < pictureTables.remote.maxAgeHours * MILLIS_PER_HOUR;
  return {
    file,
    bytes: isFresh ? new Uint8Array(await readFile(file)) : undefined
  };
}

// The one remote policy: fetched only when the setting is on, with a timeout and a size cap, and kept on disk.
async function fetched({ url, cacheFolder }: {
  url: string;
  cacheFolder: string;
}) {
  const cached = await fromCache({
    cacheFolder,
    url
  });
  const isCached = cached.bytes !== undefined;
  if (isCached) {
    return cached.bytes;
  }

  const { maxBytes, timeoutMillis } = pictureTables.remote;
  const response = await fetch(url, { signal: AbortSignal.timeout(timeoutMillis) }).catch(() => undefined);
  const length = Number(response?.headers.get("content-length") ?? 0);
  const isUsable = response?.ok === true && length <= maxBytes;
  if (!isUsable) {
    return undefined;
  }

  const bytes = new Uint8Array(await response.arrayBuffer());
  const isOverCap = bytes.length > maxBytes;
  if (isOverCap) {
    return undefined;
  }

  await mkdir(cacheFolder, { recursive: true });
  await writeFile(cached.file, bytes);
  return bytes;
}

function dataUriOf({ extension, bytes }: {
  extension: string;
  bytes: Uint8Array;
}) {
  const shown = extension === ICO ? singleFrameIcon({
    bytes,
    index: bestFrameIndex(iconFrames(bytes))
  }) : bytes;
  return `data:${mimeOf(extension) ?? "application/octet-stream"};${BASE64},${Buffer.from(shown).toString(BASE64)}`;
}

function loaded({ name, extension, bytes }: {
  name: string;
  extension: string;
  bytes: Uint8Array;
}) {
  const size = imageSizeOf({
    extension,
    bytes
  });
  return {
    state: PictureState.SHOWN,
    name,
    size,
    byteSize: bytes.length,
    byteSizeText: byteSizeText(bytes.length),
    dataUri: dataUriOf({
      extension,
      bytes
    }),
    isVector: extension === SVG
  };
}

/**
 * What a picture value is, resolved: a data URI to draw it with and its size, or the reason there is none (the file
 * is missing or too large, a remote picture waits for the setting).
 */
export async function loadPicture({ value, file, root, isRemoteEnabled, cacheFolder }: {
  value: string;
  file: string;
  root: string;
  isRemoteEnabled: boolean;
  cacheFolder: string;
}) {
  const target = pictureTargetOf({
    value,
    file,
    root
  });
  const base = {
    name: value,
    candidates: target.candidates,
    kind: target.kind
  };
  const isData = target.kind === PictureKind.DATA;
  if (isData) {
    return {
      ...base,
      state: PictureState.SHOWN,
      size: undefined,
      byteSize: 0,
      byteSizeText: "",
      dataUri: value,
      isVector: false
    };
  }

  const isRemote = target.kind === PictureKind.REMOTE;
  if (isRemote) {
    const bytes = isRemoteEnabled ? await fetched({
      url: value,
      cacheFolder
    }).catch(() => undefined) : undefined;
    const state = isRemoteEnabled ? PictureState.REMOTE_FAILED : PictureState.REMOTE_OFF;
    const hasBytes = bytes !== undefined && mimeOf(target.extension) !== undefined;
    return hasBytes ? {
      ...base,
      ...loaded({
        name: value,
        extension: target.extension,
        bytes
      })
    } : {
      ...base,
      state,
      size: undefined,
      byteSize: 0,
      byteSizeText: "",
      dataUri: undefined,
      isVector: false
    };
  }

  const found = await Promise.all(
    target.candidates.map(async candidate => ({
      candidate,
      info: await exists(candidate)
    }))
  );
  const match = found.find(entry => entry.info !== undefined);
  const info = match?.info;
  const hasNoFile = match === undefined || info === undefined;
  if (hasNoFile) {
    return {
      ...base,
      state: PictureState.MISSING,
      size: undefined,
      byteSize: 0,
      byteSizeText: "",
      dataUri: undefined,
      isVector: false
    };
  }

  const isTooLarge = info.size > pictureTables.limits.maxFileBytes;
  if (isTooLarge) {
    return {
      ...base,
      state: PictureState.TOO_LARGE,
      size: undefined,
      byteSize: info?.size ?? 0,
      byteSizeText: byteSizeText(info.size),
      dataUri: undefined,
      isVector: false
    };
  }

  return {
    ...base,
    ...loaded({
      name: path.basename(match.candidate),
      extension: target.extension,
      bytes: new Uint8Array(await readFile(match.candidate))
    })
  };
}
