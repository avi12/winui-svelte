import { existsSync } from "node:fs";
import path from "node:path";

const FALLBACK_NAME = "download";
const INVALID_CHARACTERS = /[<>:"|?*\u0000-\u001F]/u;
const EXTENDED_NAME = /filename\*\s*=\s*(?:utf-8|UTF-8)''([^;]+)/u;
const QUOTED_NAME = /filename\s*=\s*"([^"]+)"/u;
const PLAIN_NAME = /filename\s*=\s*([^;]+)/u;

function decoded(text: string) {
  try {
    return decodeURIComponent(text);
  } catch {
    return text;
  }
}

function dispositionName(header: string | null) {
  const match = EXTENDED_NAME.exec(header ?? "") ?? QUOTED_NAME.exec(header ?? "") ?? PLAIN_NAME.exec(header ?? "");
  const name = match?.[1];
  return name === undefined ? undefined : path.basename(decoded(name.trim()));
}

function addressName(address: string) {
  const name = path.posix.basename(new URL(address).pathname);
  return name === "" ? undefined : decoded(name);
}

function cleaned(name: string) {
  return name.replaceAll(/[<>:"|?*\\/\u0000-\u001F]/gu, "_");
}

/**
 * Checks that `DownloadOptions.filename` stays inside the downloads folder, as
 * Chrome requires: relative, no `..`, no drive, no characters Windows forbids.
 *
 * @param filename - The name as the caller gave it.
 * @throws {Error} When it would leave the folder or is not a valid name.
 */
export function assertRelativeFilename(filename: string) {
  const segments = filename.split(/[\\/]/u);
  const isEscaping = path.isAbsolute(filename) || /^[a-z]:/iu.test(filename) || segments.includes("..");
  const isInvalid = isEscaping || segments.some(segment => INVALID_CHARACTERS.test(segment) || segment === "");
  if (isInvalid) {
    throw new Error(`Invalid filename: ${filename}`);
  }
}

/**
 * The name a download is saved under: the caller's, else the server's
 * `Content-Disposition`, else the last part of the address.
 *
 * @param options - The caller's name, the response headers and the address.
 * @returns A file name, without folders when it is not the caller's.
 */
export function suggestedName({ filename, disposition, address }: {
  filename: string | undefined;
  disposition: string | null;
  address: string;
}) {
  return filename ?? cleaned(dispositionName(disposition) ?? addressName(address) ?? FALLBACK_NAME);
}

/**
 * A path that no file uses yet: the given one, else with " (1)", " (2)" and so
 * on before the extension, as a browser numbers a repeated download.
 *
 * @param location - The wanted path.
 * @returns A free path.
 */
export function uniquePath(location: string) {
  const { dir, name, ext } = path.parse(location);
  let candidate = location;
  for (let attempt = 1; existsSync(candidate); attempt += 1) {
    candidate = path.join(dir, `${name} (${attempt})${ext}`);
  }

  return candidate;
}
