import path from "node:path";

// What `winapp restore` and `pnpm bindings` leave in this repository, named
// once for the scripts that read them.

const PACKAGE_ROOT = path.join(import.meta.dirname, "..");
const WINAPP_FOLDER = path.join(PACKAGE_ROOT, ".winapp");

/** The bindings winapp generates (and scripts/bindings/after-winapp.ts adds to). */
export const WINAPP_BINDINGS = path.join(WINAPP_FOLDER, "bindings");

/** The native libraries winapp restores, one folder per architecture. */
export const WINAPP_BINARIES = path.join(WINAPP_FOLDER, "bin");

/** The winmds winapp restored, by package. */
export const WINAPP_LOCK = path.join(WINAPP_FOLDER, "winmds.lock.json");
