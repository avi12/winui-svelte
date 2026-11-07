import { InterruptReason } from "./download-types.ts";
import { DownloadError } from "./fetch-to-file.ts";

const HTTP_UNAUTHORIZED = 401;
const HTTP_PROXY_AUTH = 407;
const HTTP_FORBIDDEN = 403;
const HTTP_NOT_FOUND = 404;
const HTTP_GONE = 410;

const FILE_CODES = new Map<string, InterruptReason>([
  ["EACCES", InterruptReason.FILE_ACCESS_DENIED],
  ["EPERM", InterruptReason.FILE_ACCESS_DENIED],
  ["EBUSY", InterruptReason.FILE_ACCESS_DENIED],
  ["ENOSPC", InterruptReason.FILE_NO_SPACE],
  ["ENAMETOOLONG", InterruptReason.FILE_NAME_TOO_LONG],
  ["EFBIG", InterruptReason.FILE_TOO_LARGE]
]);

function reasonOfStatus(status: number) {
  const isUnauthorized = status === HTTP_UNAUTHORIZED || status === HTTP_PROXY_AUTH;
  if (isUnauthorized) {
    return InterruptReason.SERVER_UNAUTHORIZED;
  }

  const isForbidden = status === HTTP_FORBIDDEN;
  if (isForbidden) {
    return InterruptReason.SERVER_FORBIDDEN;
  }

  const isMissing = status === HTTP_NOT_FOUND || status === HTTP_GONE;
  return isMissing ? InterruptReason.SERVER_BAD_CONTENT : InterruptReason.SERVER_FAILED;
}

/**
 * Maps what ended a download to the `InterruptReason` Chrome would report.
 *
 * @param error - What the request or the file write threw.
 * @returns The reason, and whether a later `resume` can continue.
 */
export function interruptionOf(error: unknown) {
  const isRefused = error instanceof DownloadError;
  if (isRefused) {
    return {
      reason: reasonOfStatus(error.status),
      canResume: false
    };
  }

  const isNetwork = error instanceof TypeError;
  if (isNetwork) {
    return {
      reason: InterruptReason.NETWORK_FAILED,
      canResume: true
    };
  }

  const hasCode = error instanceof Error && "code" in error;
  const code: unknown = hasCode ? error.code : undefined;
  const reason = typeof code === "string" ? FILE_CODES.get(code) : undefined;
  return {
    reason: reason ?? InterruptReason.FILE_FAILED,
    canResume: false
  };
}
