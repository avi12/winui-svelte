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
