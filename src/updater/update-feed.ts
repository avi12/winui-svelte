import { compareVersions } from "./version.ts";
import { z } from "zod";

const releaseSchema = z.object({
  version: z.string(),
  file: z.string(),
  sha256: z.string(),
  size: z.number()
});

const feedSchema = z.object({
  releases: z.array(releaseSchema)
});

/** One published version: its zip, the zip's SHA-256 (hex) and its size in bytes. */
export type Release = z.infer<typeof releaseSchema>;

/** The `releases.json` an update host serves next to the zips. */
export type UpdateFeed = z.infer<typeof feedSchema>;

const DEFAULT_FEED_FILE = "releases.json";

/**
 * The file name a channel's feed has: `releases.json`, or `releases.<channel>.json`
 * for a named one such as `beta`. The one place the name is decided, for the
 * publisher and for the address the app is given.
 *
 * @param channel - The channel, or undefined for the default one.
 * @returns The feed's file name.
 */
export function feedFileName(channel?: string) {
  return channel === undefined ? DEFAULT_FEED_FILE : `releases.${channel}.json`;
}

/**
 * Reads and validates a feed.
 *
 * @param options - The feed address and an optional stand-in for `fetch`.
 * @returns The feed.
 * @throws {Error} When the host answers with a failing status or the body is not a feed.
 */
export async function fetchFeed({ url, fetch: fetchImpl = fetch }: {
  url: string;
  fetch?: typeof fetch;
}) {
  const response = await fetchImpl(url, {
    cache: "no-store"
  });
  if (!response.ok) {
    throw new Error(`Update feed ${url} answered HTTP ${response.status}`);
  }

  return parseFeed(await response.json());
}

/**
 * Validates a decoded feed.
 *
 * @param value - The parsed JSON.
 * @returns The feed.
 * @throws {Error} When the value is not a feed.
 */
export function parseFeed(value: unknown) {
  return feedSchema.parse(value);
}

/**
 * Picks the newest release of a feed.
 *
 * @param feed - The feed.
 * @returns The release with the highest version, or undefined for an empty feed.
 */
export function newestRelease(feed: UpdateFeed) {
  const ordered = feed.releases.toSorted((left, right) => compareVersions({
    left: right.version,
    right: left.version
  }));
  return ordered[0];
}

/**
 * Adds a release to a feed, replacing one of the same version.
 *
 * @param options - The feed and the release.
 * @returns A new feed.
 */
export function withRelease({ feed, release }: {
  feed: UpdateFeed;
  release: Release;
}) {
  const others = feed.releases.filter(existing => existing.version !== release.version);
  return {
    releases: [...others, release]
  } satisfies UpdateFeed;
}
