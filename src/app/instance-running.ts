import { currentUserSid, pipeNameFor } from "./instance-pipe.ts";
import { existsSync } from "node:fs";

/**
 * Whether another copy serves `key` for this user, asked of the pipe the way
 * `ensureSingleInstance` serves it. It sends nothing and never starts a copy
 * or claims the key, so a native messaging host or a launcher can ask before
 * it decides to start the app. It returns at once (it asks the file system
 * whether the pipe exists, which opens no connection), and needs no UI thread
 * or window.
 *
 * @param options - The app's key, as `ensureSingleInstance` was given it.
 * @returns True while a copy serves the key; false after it exits or releases.
 */
export function isInstanceRunning({ key }: { key: string }) {
  return existsSync(
    pipeNameFor({
      key,
      sid: currentUserSid()
    })
  );
}
