import { tmpdir } from "node:os";
import path from "node:path";

/** The folders an app keeps its data in. */
export const AppDataLocation = {
  LOCAL: "local",
  ROAMING: "roaming",
  TEMPORARY: "temporary"
} as const;
/** One of the values of `AppDataLocation`. */
export type AppDataLocation = (typeof AppDataLocation)[keyof typeof AppDataLocation];

/** Where the app's data folders are; the tests give their own. */
export interface AppDataEnvironment {
  readonly localAppData?: string | undefined;
  readonly roamingAppData?: string | undefined;
  readonly temporary?: string | undefined;
}

/**
 * The name of the running program without its extension, the default name of
 * an app's folder.
 *
 * @returns For example `my-app` for `my-app.exe`.
 */
function defaultAppName() {
  return path.basename(process.execPath, path.extname(process.execPath));
}

/**
 * An app's data folder: `%LOCALAPPDATA%\<app>`, `%APPDATA%\<app>` or a folder
 * under the system's temporary one. A packaged app gets the same paths and
 * Windows redirects them into its package's own folders, so the one rule
 * serves both.
 *
 * @param options - The app's name, which folder, and (for tests) where they are.
 * @returns The path; the folder may not exist yet.
 */
export function appDataFolder({ appName = defaultAppName(), location = AppDataLocation.LOCAL, environment = {} }: {
  appName?: string;
  location?: AppDataLocation;
  environment?: AppDataEnvironment;
}) {
  const roots = {
    [AppDataLocation.LOCAL]: environment.localAppData ?? process.env["LOCALAPPDATA"],
    [AppDataLocation.ROAMING]: environment.roamingAppData ?? process.env["APPDATA"],
    [AppDataLocation.TEMPORARY]: environment.temporary ?? tmpdir()
  } as const;
  const root = roots[location];
  const hasRoot = root !== undefined && root !== "";
  if (!hasRoot) {
    throw new Error(`this machine has no ${location} app data folder`);
  }

  return path.join(root, appName);
}
