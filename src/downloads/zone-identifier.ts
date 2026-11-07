import { writeFile } from "node:fs/promises";

const INTERNET_ZONE = 3;
const ZONE_STREAM = "Zone.Identifier";

/**
 * The text of a file's `Zone.Identifier` stream: ZoneId 3 (the Internet zone)
 * and the address the file came from, which is what makes Explorer and
 * SmartScreen warn before an executable runs.
 *
 * @param hostUrl - Where the file was downloaded from; credentials are dropped.
 * @returns The stream's text.
 */
export function zoneIdentifierText(hostUrl: string) {
  const address = new URL(hostUrl);
  address.username = "";
  address.password = "";
  return `[ZoneTransfer]\r\nZoneId=${INTERNET_ZONE}\r\nHostUrl=${address.href}\r\n`;
}

/**
 * Marks a file as downloaded from the Internet (Mark of the Web) by writing
 * its `Zone.Identifier` alternate data stream. A volume that has no streams
 * (FAT, a network share) is left unmarked.
 *
 * @param options - The file and the address it came from.
 */
export async function markOfTheWeb({ path, hostUrl }: {
  path: string;
  hostUrl: string;
}) {
  try {
    await writeFile(`${path}:${ZONE_STREAM}`, zoneIdentifierText(hostUrl));
  } catch (error) {
    const hasCode = error instanceof Error && "code" in error;
    const code = hasCode ? error.code : undefined;
    const isStreamUnsupported = code === "EINVAL" || code === "ENOENT";
    if (!isStreamUnsupported) {
      throw error;
    }
  }
}
