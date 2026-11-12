import { appFolder, packagesFolder } from "./install-layout.ts";
import type { Release } from "./update-feed.ts";
import { unzipTo } from "./zip-tool.ts";
import { requestDownload } from "#src/downloads/fetch-to-file.js";
import { createHash } from "node:crypto";
import { createReadStream, createWriteStream } from "node:fs";
import { mkdir, rename, rm, stat } from "node:fs/promises";
import path from "node:path";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";

const STAGING_SUFFIX = ".staging";
const PARTIAL_SUFFIX = ".partial";

async function sha256Of(file: string) {
  const hash = createHash("sha256");
  await pipeline(createReadStream(file), hash);
  return hash.digest("hex");
}

async function downloadVerified({ url, target, release, fetchImpl }: {
  url: string;
  target: string;
  release: Release;
  fetchImpl: typeof fetch;
}) {
  const partial = `${target}${PARTIAL_SUFFIX}`;
  const existing = await stat(partial).then(({ size }) => size, () => 0);
  const isResumable = existing > 0 && existing < release.size;
  const download = await requestDownload({
    url,
    offset: isResumable ? existing : 0,
    fetch: fetchImpl
  });
  const { body } = download.response;
  const hasNoBody = body === null;
  if (hasNoBody) {
    throw new TypeError(`Update package ${url} has no body`);
  }

  await pipeline(
    Readable.from(body), createWriteStream(partial, {
      flags: download.offset > 0 ? "a" : "w"
    })
  );
  const isDamaged = (await stat(partial)).size !== release.size || await sha256Of(partial) !== release.sha256;
  if (isDamaged) {
    await rm(partial, {
      force: true
    });
    throw new Error(`Update package ${release.file} failed its size or SHA-256 check`);
  }

  await rename(partial, target);
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
