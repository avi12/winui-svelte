import { appDataFolder, AppDataLocation } from "./app-data-folder.ts";
import type { AppDataEnvironment } from "./app-data-folder.ts";
import { mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import path from "node:path";

/** Where a small piece of app state is kept (`localStorage`, a window's saved place); the tests give a stand-in. */
export interface StorageFile {
  /** The stored text, or undefined when there is none. */
  read(): string | undefined;

  /** Replaces the stored text; a reader sees the old text or the new, never half. */
  write(text: string): void;
}

/**
 * A file that is replaced atomically: the text goes to a sibling file that is
 * then renamed over the target.
 *
 * @param location - The file's path; its folder is made on the first write.
 * @returns The storage file.
 */
export function atomicFile(location: string) {
  return {
    read() {
      try {
        return readFileSync(location, "utf8");
      } catch {
        return undefined;
      }
    },
    write(text) {
      const swap = `${location}.swap`;
      mkdirSync(path.dirname(location), { recursive: true });
      writeFileSync(swap, text);
      renameSync(swap, location);
    }
  } satisfies StorageFile;
}

/**
 * The storage file of an API in the app's data folder, unless the options
 * give their own.
 *
 * @param options - The file name, and the options the API was given: its own file, the app's name,
 *   the folder and where the folders are.
 * @returns The storage file.
 */
export function appDataFile({ fileName, options }: {
  readonly fileName: string;
  readonly options: {
    readonly file?: StorageFile;
    readonly appName?: string;
    readonly location?: AppDataLocation;
    readonly environment?: AppDataEnvironment;
  };
}) {
  return options.file ?? atomicFile(
    path.join(
      appDataFolder({
        location: options.location ?? AppDataLocation.LOCAL,
        ...options.appName !== undefined && {
          appName: options.appName
        },
        ...options.environment !== undefined && {
          environment: options.environment
        }
      }),
      fileName
    )
  );
}
