const VERSION_PATTERN = /^(\d+)\.(\d+)\.(\d+)$/;

/**
 * Splits `major.minor.patch` into numbers.
 *
 * @param version - A three-part version such as `1.4.2`.
 * @returns The three numbers, major first.
 * @throws {TypeError} When the text is not a three-part version.
 */
export function parseVersion(version: string) {
  const match = VERSION_PATTERN.exec(version);
  const isMalformed = match === null;
  if (isMalformed) {
    throw new TypeError(`Not a major.minor.patch version: ${version}`);
  }

  return match.slice(1).map(Number);
}

/**
 * Orders two versions the way a sort wants it.
 *
 * @param options - The two versions.
 * @returns Negative when `left` is older, positive when newer, 0 when equal.
 */
export function compareVersions({ left, right }: {
  left: string;
  right: string;
}) {
  const leftParts = parseVersion(left);
  const rightParts = parseVersion(right);
  for (const [i, part] of leftParts.entries()) {
    const difference = part - (rightParts[i] ?? 0);
    const isDifferent = difference !== 0;
    if (isDifferent) {
      return difference;
    }
  }

  return 0;
}
