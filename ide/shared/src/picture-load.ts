import {
  bestFrameIndex,
  byteSizeText,
  iconFrames,
  imageSizeOf,
  singleFrameIcon
} from "./picture-image.ts";
import { mimeOf, PictureKind, pictureTargetOf } from "./picture-paths.ts";
import { FAILURE_NOTES, RemoteState } from "./picture-remote.ts";
import type { createRemotePictures } from "./picture-remote.ts";
import { pictureTables } from "./picture-spec.ts";
import { readFile, stat } from "node:fs/promises";
import path from "node:path";

export const PictureState = {
  SHOWN: "shown",
  MISSING: "missing",
  TOO_LARGE: "tooLarge",
  REMOTE_OFF: "remoteOff",
  REMOTE_PENDING: "remotePending",
  REMOTE_FAILED: "remoteFailed"
} as const;
export type PictureState = (typeof PictureState)[keyof typeof PictureState];

const BASE64 = "base64";
const ICO = "ico";
const SVG = "svg";

async function exists(file: string) {
  return stat(file).then(info => info.isFile() ? info : undefined, () => undefined);
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

function unloaded({ base, state, note }: {
  base: {
    name: string;
    candidates: string[];
    kind: string;
  };
  state: PictureState;
  note: string;
}) {
  return {
    ...base,
    state,
    note,
    size: undefined,
    byteSize: 0,
    byteSizeText: "",
    dataUri: undefined,
    isVector: false
  };
}

// A remote picture is never waited for: it is shown when it is in memory or on disk, and otherwise asked for in the
// background, the previews looking again when the fetch settles.
function remoteOf({ base, value, isRemoteEnabled, remote }: {
  base: {
    name: string;
    candidates: string[];
    kind: string;
  };
  value: string;
  isRemoteEnabled: boolean;
  remote: Pick<ReturnType<typeof createRemotePictures>, "peek" | "request">;
}) {
  if (!isRemoteEnabled) {
    return unloaded({
      base,
      state: PictureState.REMOTE_OFF,
      note: "remote picture, previews are off"
    });
  }

  const found = remote.peek(value);
  const isReady = found.state === RemoteState.READY;
  if (isReady) {
    return {
      ...base,
      note: "",
      ...loaded({
        name: value,
        extension: found.extension,
        bytes: found.bytes
      })
    };
  }

  const hasFailed = found.state === RemoteState.FAILED;
  if (hasFailed) {
    return unloaded({
      base,
      state: PictureState.REMOTE_FAILED,
      note: `not fetched: ${FAILURE_NOTES[found.failure]}`
    });
  }

  remote.request(value);
  return unloaded({
    base,
    state: PictureState.REMOTE_PENDING,
    note: "fetching"
  });
}

/**
 * What a picture value is, resolved: a data URI to draw it with and its size, or the reason there is none (the file
 * is missing or too large, a remote picture waits for the setting).
 */
export async function loadPicture({ value, file, root, isRemoteEnabled, remote }: {
  value: string;
  file: string;
  root: string;
  isRemoteEnabled: boolean;
  remote: Pick<ReturnType<typeof createRemotePictures>, "peek" | "request">;
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
      note: "",
      size: undefined,
      byteSize: 0,
      byteSizeText: "",
      dataUri: value,
      isVector: false
    };
  }

  const isRemote = target.kind === PictureKind.REMOTE;
  if (isRemote) {
    return remoteOf({
      base,
      value,
      isRemoteEnabled,
      remote
    });
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
    return unloaded({
      base,
      state: PictureState.MISSING,
      note: "file not found"
    });
  }

  const isTooLarge = info.size > pictureTables.limits.maxFileBytes;
  if (isTooLarge) {
    return unloaded({
      base,
      state: PictureState.TOO_LARGE,
      note: `too large to preview (${byteSizeText(info.size)})`
    });
  }

  return {
    ...base,
    note: "",
    ...loaded({
      name: path.basename(match.candidate),
      extension: target.extension,
      bytes: new Uint8Array(await readFile(match.candidate))
    })
  };
}
