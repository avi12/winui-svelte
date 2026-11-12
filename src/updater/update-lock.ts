import { packagesFolder } from "./install-layout.ts";
import { mkdir, open, readFile, rm } from "node:fs/promises";
import path from "node:path";

const LOCK_FILE = ".update.lock";
const FILE_EXISTS = "EEXIST";
const EXCLUSIVE_CREATE = "wx";

/** Another process is already downloading or applying an update. */
export class UpdateLockedError extends Error {
  constructor() {
    super("Another process is updating this install");
    this.name = "UpdateLockedError";
  }
}

/**
 * The lock file's path, for the cleanup that must leave it alone.
 *
 * @param root - The install root.
 * @returns The path of the lock file.
 */
export function lockPath(root: string) {
  return path.join(packagesFolder(root), LOCK_FILE);
}

function isAlive(pid: number) {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

async function ownerIsAlive(file: string) {
  const pid = Number(await readFile(file, "utf8").catch(() => ""));
  const isUnreadable = !Number.isInteger(pid) || pid <= 0;
  return !isUnreadable && isAlive(pid);
}

async function acquire(file: string) {
  try {
    const handle = await open(file, EXCLUSIVE_CREATE);
    await handle.writeFile(String(process.pid));
    await handle.close();
    return true;
  } catch (error) {
    const isTaken = error instanceof Error && "code" in error && error.code === FILE_EXISTS;
    if (!isTaken) {
      throw error;
    }

    return false;
  }
}

/**
 * Runs `run` while holding an exclusive lock file in the packages folder, so
 * two copies of the app (or the app and its launcher) never download or apply
 * at once. A lock whose owner process is gone is taken over.
 *
 * @param options - The install root and the work to run.
 * @returns What `run` returns.
 * @throws {UpdateLockedError} When a live process holds the lock.
 */
export async function withUpdateLock<T>({ root, run }: {
  root: string;
  run: () => Promise<T>;
}) {
  const file = lockPath(root);
  await mkdir(packagesFolder(root), {
    recursive: true
  });
  const isFirstTry = await acquire(file);
  if (!isFirstTry) {
    const isHeld = await ownerIsAlive(file);
    if (isHeld) {
      throw new UpdateLockedError();
    }

    await rm(file, {
      force: true
    });
    const isSecondTry = await acquire(file);
    if (!isSecondTry) {
      throw new UpdateLockedError();
    }
  }

  try {
    return await run();
  } finally {
    await rm(file, {
      force: true
    });
  }
}
