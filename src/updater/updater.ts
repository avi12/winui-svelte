import { appFolder, installedVersions } from "./install-layout.ts";
import { stageRelease } from "./stage-release.ts";
import type { Release } from "./update-feed.ts";
import { fetchFeed, newestRelease } from "./update-feed.ts";
import { compareVersions } from "./version.ts";
import { spawn } from "node:child_process";
import { rm } from "node:fs/promises";
import path from "node:path";

/** What `Updater` takes. */
export interface UpdaterOptions {
  /** The install root, for example `%LOCALAPPDATA%\MyApp`; each version gets an `app-x.y.z` folder in it. */
  readonly root: string;

  /** The address of `releases.json`; the zips are fetched from the same folder. */
  readonly feedUrl: string;

  /** The version that is running now. */
  readonly currentVersion: string;

  /** The executable inside a version's folder that `restart` starts, relative to that folder. */
  readonly executable: string;

  /** Stands in for the global `fetch`; the tests give one. */
  readonly fetch?: typeof fetch;
}

/**
 * Squirrel-style updates for a per-user install: versions sit side by side in
 * `app-x.y.z` folders under one root, a new one is downloaded, verified and
 * unpacked next to the running one, and `restart` starts it. No installer, no
 * administrator rights, no certificate.
 */
export class Updater {
  private readonly options: UpdaterOptions;

  constructor(options: UpdaterOptions) {
    this.options = options;
  }

  /**
   * Asks the feed for a newer release.
   *
   * @returns The release, or undefined when the running version is the newest.
   */
  async checkForUpdate() {
    const { feedUrl, currentVersion, fetch: fetchImpl } = this.options;
    const feed = await fetchFeed({
      url: feedUrl,
      ...fetchImpl && {
        fetch: fetchImpl
      }
    });
    const newest = newestRelease(feed);
    const isNewer = newest !== undefined && compareVersions({
      left: newest.version,
      right: currentVersion
    }) > 0;
    return isNewer ? newest : undefined;
  }

  /**
   * Downloads and unpacks a release beside the running version.
   *
   * @param release - A release from `checkForUpdate`.
   * @returns The folder of the new version.
   */
  stage(release: Release) {
    const { root, feedUrl, fetch: fetchImpl } = this.options;
    return stageRelease({
      root,
      baseUrl: feedUrl,
      release,
      ...fetchImpl && {
        fetch: fetchImpl
      }
    });
  }

  /**
   * Checks, then stages when there is something newer.
   *
   * @returns The staged release, or undefined when already current.
   */
  async update() {
    const release = await this.checkForUpdate();
    const isCurrent = release === undefined;
    if (isCurrent) {
      return undefined;
    }

    await this.stage(release);
    return release;
  }

  /**
   * Starts a staged version, detached, so the caller can exit right after.
   *
   * @param options - The version to start and the arguments to give it.
   */
  restart({ version, args = [] }: {
    version: string;
    args?: readonly string[];
  }) {
    const folder = appFolder({
      root: this.options.root,
      version
    });
    const child = spawn(path.join(folder, this.options.executable), args, {
      cwd: folder,
      detached: true,
      stdio: "ignore"
    });
    child.unref();
  }

  /**
   * Removes every version except the running one and the newest installed;
   * a folder still in use stays for the next run.
   */
  async prune() {
    const { root, currentVersion } = this.options;
    const versions = await installedVersions(root);
    const newest = versions[0];
    const removals = versions
      .filter(version => version !== currentVersion && version !== newest)
      .map(version => rm(
        appFolder({
          root,
          version
        }), {
          recursive: true,
          force: true
        }
      ).catch(() => undefined));
    await Promise.all(removals);
  }
}
