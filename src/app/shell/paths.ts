import { lstatSync } from "node:fs";
import path from "node:path";

const CONTROL_PATTERN = /[\u0000-\u001f\u007f]/u;
const UNSAFE_PREFIXES = ["\\\\?\\", "\\\\.\\"] as const;

/**
 * Whether a path is something the shell verbs take: absolute, with no
 * control character and not a device or `\?\` path. Paths are data: they
 * are passed to Windows as they are and never joined into a command line.
 *
 * @param value - The path.
 * @returns True when it is acceptable.
 */
export function isShellPath(value: string) {
  const hasControl = CONTROL_PATTERN.test(value);
  const isDevicePath = UNSAFE_PREFIXES.some(prefix => value.startsWith(prefix));
  return !hasControl && !isDevicePath && path.win32.isAbsolute(value) && !value.endsWith("\\");
}

/**
 * Whether something is at a path, a broken link included.
 *
 * @param value - The path.
 * @returns True when the path names an entry.
 */
export function pathExists(value: string) {
  return lstatSync(value, { throwIfNoEntry: false }) !== undefined;
}
