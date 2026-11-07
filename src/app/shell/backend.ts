import type { ShellResult } from "./kinds.ts";

/** What a shortcut holds. */
export interface ShortcutProperties {
  /** The full path of what the shortcut opens. */
  readonly target: string;

  /** The command line after the target, as one string already quoted for Windows. */
  readonly arguments: string;

  /** The folder the target starts in, or an empty string. */
  readonly workingDirectory: string;

  /** The file the icon comes from, or an empty string for the target's own. */
  readonly iconPath: string;
  readonly iconIndex: number;
  readonly description: string;
}

/** The Windows calls the shell verbs make; a test gives a fake. */
export interface ShellBackend {
  /** Sends files to the Recycle Bin, never deleting one permanently without Windows asking. */
  recycle(paths: readonly string[]): ShellResult;

  /** Writes a `.lnk` file. */
  writeShortcut(options: ShortcutProperties & { readonly path: string }): void;

  /** Reads a `.lnk` file without resolving or searching for a moved target. */
  readShortcut(path: string): ShortcutProperties;
}
