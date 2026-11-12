import type { UpdateFeed } from "./update-feed.ts";
import { parseFeed, withRelease } from "./update-feed.ts";
import { parseVersion } from "./version.ts";
import { zipFolder } from "./zip-tool.ts";
import { createHash } from "node:crypto";
import { mkdir, readFile, stat, writeFile } from "node:fs/promises";
import path from "node:path";

const FEED_FILE = "releases.json";
const JSON_INDENT = 2;

async function existingFeed(feedPath: string) {
  const text = await readFile(feedPath, "utf8").catch(() => undefined);
  const isMissing = text === undefined;
  if (isMissing) {
    return {
      releases: []
    } satisfies UpdateFeed;
  }

  return parseFeed(JSON.parse(text));
}

/**
 * Packs a built app into `<name>-<version>.zip` and records it in
 * `releases.json`, ready to upload to any static host. Run it from a release
 * script; the folder it writes is what the app's update address serves.
 *
 * @param options - The built app's folder, its name and version, and the folder to write into.
 * @returns The release entry that was recorded.
 */
export async function createRelease({ appDirectory, name, version, outputDirectory }: {
  appDirectory: string;
  name: string;
  version: string;
  outputDirectory: string;
}) {
  parseVersion(version);
  await mkdir(outputDirectory, {
    recursive: true
  });
  const file = `${name}-${version}.zip`;
  const zip = path.join(outputDirectory, file);
  await zipFolder({
    folder: appDirectory,
    zip
  });
  const sha256 = createHash("sha256").update(await readFile(zip)).digest("hex");
  const release = {
    version,
    file,
    sha256,
    size: (await stat(zip)).size
  };
  const feedPath = path.join(outputDirectory, FEED_FILE);
  const feed = withRelease({
    feed: await existingFeed(feedPath),
    release
  });
  await writeFile(feedPath, JSON.stringify(feed, undefined, JSON_INDENT));
  return release;
}
