import { pictureTargetOf } from "./picture-paths.ts";
import { isFetchableUrl, redirectTarget, sniffExtension } from "./picture-remote-policy.ts";
import { pictureTables } from "./picture-spec.ts";
import { createHash } from "node:crypto";
import { mkdir, readFile, stat, writeFile } from "node:fs/promises";
import path from "node:path";

export const RemoteFailure = {
  BLOCKED: "blocked",
  TIMEOUT: "timeout",
  STATUS: "status",
  TOO_LARGE: "tooLarge",
  NOT_A_PICTURE: "notAPicture",
  NETWORK: "network"
} as const;
export type RemoteFailure = (typeof RemoteFailure)[keyof typeof RemoteFailure];

export const RemoteState = {
  READY: "ready",
  PENDING: "pending",
  FAILED: "failed",
  UNKNOWN: "unknown"
} as const;
export type RemoteState = (typeof RemoteState)[keyof typeof RemoteState];

/**
 * The words a hover gives for a remote picture that could not be fetched.
 */
export const FAILURE_NOTES = {
  [RemoteFailure.BLOCKED]: "the address is not allowed (only http and https, no credentials, no link-local host)",
  [RemoteFailure.TIMEOUT]: "the server did not answer in time",
  [RemoteFailure.STATUS]: "the server did not answer with the picture",
  [RemoteFailure.TOO_LARGE]: "the picture is over the size cap",
  [RemoteFailure.NOT_A_PICTURE]: "the answer is not a picture the previews can draw",
  [RemoteFailure.NETWORK]: "the server could not be reached"
} as const satisfies Record<RemoteFailure, string>;

const MILLIS_PER_MINUTE = 60_000;
const MILLIS_PER_HOUR = 3_600_000;
const REDIRECT_FIRST = 300;
const REDIRECT_LAST = 399;

type Fetcher = (url: string, init: RequestInit) => Promise<Response>;

async function bodyOf({ response, maxBytes }: {
  response: Response;
  maxBytes: number;
}) {
  const reader = response.body?.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  while (reader) {
    const chunk = await reader.read();
    if (chunk.done) {
      break;
    }

    total += chunk.value.length;
    const isOverCap = total > maxBytes;
    if (isOverCap) {
      await reader.cancel();
      return undefined;
    }

    chunks.push(chunk.value);
  }

  return Buffer.concat(chunks);
}

// The answer at the end of the redirects, each hop checked against the policy.
async function answerTo({ url, fetcher, signal }: {
  url: string;
  fetcher: Fetcher;
  signal: AbortSignal;
}) {
  let current = url;
  for (let hop = 0; hop <= pictureTables.remote.maxRedirects; hop += 1) {
    if (!isFetchableUrl(current)) {
      return { failure: RemoteFailure.BLOCKED };
    }

    const response = await fetcher(current, {
      redirect: "manual",
      credentials: "omit",
      signal,
      headers: {
        accept: "image/*"
      }
    });
    const location = response.headers.get("location");
    const isRedirect = response.status >= REDIRECT_FIRST && response.status <= REDIRECT_LAST && location !== null;
    if (!isRedirect) {
      return {
        failure: undefined,
        response,
        url: current
      };
    }

    await response.body?.cancel();
    const target = redirectTarget({
      from: current,
      location
    });
    if (!target) {
      return { failure: RemoteFailure.BLOCKED };
    }

    current = target;
  }

  return { failure: RemoteFailure.BLOCKED };
}

async function readPicture({ response, url }: {
  response: Response;
  url: string;
}) {
  const { maxBytes } = pictureTables.remote;
  const length = Number(response.headers.get("content-length") ?? 0);
  const bytes = length > maxBytes ? undefined : await bodyOf({
    response,
    maxBytes
  });
  if (!bytes) {
    return { failure: RemoteFailure.TOO_LARGE };
  }

  const extension = sniffExtension({
    bytes,
    contentType: response.headers.get("content-type") ?? "",
    urlExtension: pictureTargetOf({
      value: url,
      file: "/",
      root: "/"
    }).extension
  });
  return extension === "" ? { failure: RemoteFailure.NOT_A_PICTURE } : {
    failure: undefined,
    bytes,
    extension
  };
}

/**
 * Downloads one picture under the remote policy: http and https only, no credentials or cookies sent, redirects
 * followed by hand (each hop checked, never from https to http), one timeout for the whole exchange, and a size
 * cap that holds even when the server states no length.
 */
export async function download({ url, fetcher = fetch }: {
  url: string;
  fetcher?: Fetcher;
}) {
  const signal = AbortSignal.timeout(pictureTables.remote.timeoutMillis);
  try {
    const answer = await answerTo({
      url,
      fetcher,
      signal
    });
    if (answer.failure) {
      return { failure: answer.failure };
    }

    if (!answer.response?.ok) {
      return { failure: RemoteFailure.STATUS };
    }

    return await readPicture({
      response: answer.response,
      url: answer.url ?? url
    });
  } catch {
    return { failure: signal.aborted ? RemoteFailure.TIMEOUT : RemoteFailure.NETWORK };
  }
}

/**
 * The remote pictures of the previews: what is on disk (fresh for the hours the spec says), what is being fetched
 * (at most the spec's count at once, each URL once), and what failed (not tried again for some minutes). Nothing
 * here waits: a caller asks with `peek`, starts a fetch with `request`, and `onSettled` says when to look again.
 */
export function createRemotePictures({ cacheFolder, onSettled, fetcher = fetch }: {
  cacheFolder: string;
  onSettled: () => void;
  fetcher?: Fetcher;
}) {
  const ready = new Map<string, {
    bytes: Uint8Array;
    extension: string;
  }>();
  const failed = new Map<string, {
    failure: RemoteFailure;
    at: number;
  }>();
  const waiting: string[] = [];
  const running = new Set<string>();

  function fileOf({ url, extension }: {
    url: string;
    extension: string;
  }) {
    return path.join(cacheFolder, `${createHash("sha1").update(url).digest("hex")}.${extension}`);
  }

  async function fromDisk(url: string) {
    const maxAge = pictureTables.remote.maxAgeHours * MILLIS_PER_HOUR;
    for (const { extension } of pictureTables.formats) {
      const file = fileOf({
        url,
        extension
      });
      const info = await stat(file).catch(() => undefined);
      const isFresh = info !== undefined && Date.now() - info.mtimeMs < maxAge;
      if (isFresh) {
        return {
          bytes: new Uint8Array(await readFile(file)),
          extension
        };
      }
    }

    return undefined;
  }

  async function keep({ url, bytes, extension }: {
    url: string;
    bytes: Uint8Array;
    extension: string;
  }) {
    await mkdir(cacheFolder, { recursive: true });
    await writeFile(
      fileOf({
        url,
        extension
      }),
      bytes
    );
  }

  async function settle(url: string) {
    const cached = await fromDisk(url);
    if (cached) {
      ready.set(url, cached);
      return;
    }

    const result = await download({
      url,
      fetcher
    });
    const isFailed = result.failure || !result.bytes || !result.extension;
    if (isFailed) {
      failed.set(url, {
        failure: result.failure ?? RemoteFailure.NETWORK,
        at: Date.now()
      });
      return;
    }

    ready.set(url, {
      bytes: result.bytes,
      extension: result.extension
    });
    await keep({
      url,
      bytes: result.bytes,
      extension: result.extension
    });
  }

  function startNext() {
    while (running.size < pictureTables.remote.maxConcurrent && waiting.length > 0) {
      const url = waiting.shift() ?? "";
      running.add(url);
      settle(url).catch(() => failed.set(url, {
        failure: RemoteFailure.NETWORK,
        at: Date.now()
      })).finally(() => {
        running.delete(url);
        onSettled();
        startNext();
      });
    }
  }

  function peek(url: string) {
    const picture = ready.get(url);
    if (picture) {
      return {
        state: RemoteState.READY,
        ...picture
      };
    }

    const failure = failed.get(url);
    const retryAfter = pictureTables.remote.failureRetryMinutes * MILLIS_PER_MINUTE;
    const isFresh = failure && Date.now() - failure.at < retryAfter;
    if (isFresh) {
      return {
        state: RemoteState.FAILED,
        failure: failure.failure
      };
    }

    const isBusy = running.has(url) || waiting.includes(url);
    return { state: isBusy ? RemoteState.PENDING : RemoteState.UNKNOWN };
  }

  function request(url: string) {
    const isKnown = peek(url).state !== RemoteState.UNKNOWN;
    if (isKnown) {
      return;
    }

    failed.delete(url);
    waiting.push(url);
    startNext();
  }

  return {
    peek,
    request
  };
}
