import { mkdir, readFile, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import path from "node:path";
import { z } from "zod";

/** Why `onInstalled` fired. */
export const InstallReason = {
  install: "install",
  update: "update"
} as const;
/** One of the values of `InstallReason`. */
export type InstallReason = (typeof InstallReason)[keyof typeof InstallReason];

/** What `onInstalled` is called with. */
export interface InstalledDetails {
  readonly reason: InstallReason;

  /** The version that last ran; present for an update. */
  readonly previousVersion?: string;
}

/** Where the last version that ran is kept. */
export interface VersionStore {
  read(): Promise<string | undefined>;
  write(version: string): Promise<void>;
}

const versionFileSchema = z.object({ version: z.string() });
const UNSAFE_FILE_CHARACTERS = /[^\w.-]/gu;

/**
 * A version store in a JSON file under `%LOCALAPPDATA%\winui-svelte\runtime`,
 * one per app id.
 *
 * @param id - The app's id.
 * @returns The store.
 */
export function fileVersionStore(id: string) {
  const folder = path.join(process.env["LOCALAPPDATA"] ?? homedir(), "winui-svelte", "runtime");
  const file = path.join(folder, `${id.replace(UNSAFE_FILE_CHARACTERS, "_")}.json`);
  return {
    async read() {
      try {
        return versionFileSchema.parse(JSON.parse(await readFile(file, "utf8"))).version;
      } catch {
        // No file yet, or one that is not ours: either way, no earlier run is known
        return undefined;
      }
    },
    async write(version) {
      await mkdir(folder, { recursive: true });
      await writeFile(file, JSON.stringify({ version }));
    }
  } satisfies VersionStore;
}

/**
 * Compares the version that last ran with this one and records this one.
 *
 * @param options - The store and the running version.
 * @returns `install` when none ran before, `update` when another version
 *   did, null when it is the same.
 */
export async function detectInstalled({ store, version }: {
  store: VersionStore;
  version: string;
}) {
  const previous = await store.read();
  const isSame = previous === version;
  if (isSame) {
    return null;
  }

  await store.write(version);

  const isFirstRun = previous === undefined;
  if (isFirstRun) {
    return { reason: InstallReason.install } satisfies InstalledDetails;
  }

  return {
    reason: InstallReason.update,
    previousVersion: previous
  } satisfies InstalledDetails;
}
