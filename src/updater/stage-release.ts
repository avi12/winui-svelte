import { appFolder, packagesFolder } from "./install-layout.ts";
import type { Release } from "./update-feed.ts";
import { unzipTo } from "./zip-tool.ts";
import { createHash } from "node:crypto";
import { createWriteStream } from "node:fs";
import { mkdir, rename, rm } from "node:fs/promises";
import path from "node:path";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";

const STAGING_SUFFIX = ".staging";

async function downloadVerified({ url, target, release, fetchImpl }: {
  url: string;
  target: string;
  release: Release;
  fetchImpl: typeof fetch;
}) {
  const response = await fetchImpl(url);
  const body = response.body;
  const isUnusable = !response.ok || body === null;
  if (isUnusable) {
    throw new Error(`Update package ${url} answered HTTP ${response.status}`);
  }

  const hash = createHash("sha256");
  let received = 0;
  const source = Readable.from(body);
  source.on("data", (chunk: Buffer) => {
    hash.update(chunk);
    received += chunk.byteLength;
  });
  await pipeline(source, createWriteStream(target));
  const isDamaged = received !== release.size || hash.digest("hex") !== release.sha256;
  if (isDamaged) {
    await rm(target, {
      force: true
    });
    throw new Error(`Update package ${release.file} failed its size or SHA-256 check`);
  }
}

/**
 * Downloads a release, checks its size and SHA-256, unpacks it beside the
 * running version and renames the folder into place as the last step, so a
 * crash leaves either the whole new version or nothing the launcher would pick.
 *
 * @param options - The install root, the zips' address, the release and an optional stand-in for `fetch`.
 * @returns The folder of the new version.
 * @throws {Error} When the download fails or does not match the feed.
 */
export async function stageRelease({ root, baseUrl, release, fetch: fetchImpl = fetch }: {
  root: string;
  baseUrl: string;
  release: Release;
  fetch?: typeof fetch;
}) {
  const packages = packagesFolder(root);
  await mkdir(packages, {
    recursive: true
  });
  const zip = path.join(packages, release.file);
  await downloadVerified({
    url: new URL(release.file, baseUrl).href,
    target: zip,
    release,
    fetchImpl
  });
  const destination = appFolder({
    root,
    version: release.version
  });
  const staging = `${destination}${STAGING_SUFFIX}`;
  await rm(staging, {
    recursive: true,
    force: true
  });
  await mkdir(staging, {
    recursive: true
  });
  await unzipTo({
    zip,
    folder: staging
  });
  await rm(destination, {
    recursive: true,
    force: true
  });
  await rename(staging, destination);
  return destination;
}
