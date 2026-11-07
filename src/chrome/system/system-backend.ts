import { StorageUnitType } from "./system-types.ts";
import type { CpuEntry, DriveEntry } from "./system-types.ts";
import type { DisplaySource } from "#src/devices/display.js";
import { windowsScreenBackend } from "#src/web-apis/screen.js";
import { bindDll } from "#src/win32-calls.js";
import { statfs } from "node:fs/promises";
import { arch, cpus, freemem, totalmem } from "node:os";

/** Stands between `chrome.system` and the machine; a test gives its own. */
export interface SystemBackend {
  /** `os.cpus()`. */
  cpus(): readonly CpuEntry[];

  /** `os.arch()`. */
  architecture(): string;

  /** `os.totalmem()`. */
  totalMemory(): number;

  /** `os.freemem()`. */
  freeMemory(): number;

  /** The drives now present. */
  drives(): Promise<readonly DriveEntry[]>;

  /** The display areas and the events that change them. */
  readonly displays: DisplaySource;

  /** Device pixels per CSS pixel. */
  scale(): number;
}

const FIRST_LETTER = "A".codePointAt(0) ?? 0;
const LETTER_COUNT = 26;
const DRIVE_REMOVABLE = 2;
const DRIVE_FIXED = 3;
const DRIVE_TYPES = new Map<number, StorageUnitType>([
  [DRIVE_REMOVABLE, StorageUnitType.removable],
  [DRIVE_FIXED, StorageUnitType.fixed]
]);

function driveTypeOf(root: string) {
  const { getDriveType } = bindDll({
    dll: "kernel32.dll",
    functions: {
      getDriveType: ["GetDriveTypeW", ["pointer"], "u32"]
    }
  });
  return DRIVE_TYPES.get(getDriveType(root)) ?? StorageUnitType.unknown;
}

async function driveOf(root: string) {
  try {
    const stats = await statfs(root);
    return {
      root,
      label: root.slice(0, 2),
      type: driveTypeOf(root),
      capacity: stats.blocks * stats.bsize
    } satisfies DriveEntry;
  } catch {
    return null;
  }
}

/**
 * The backend over Node's `os`, a `statfs` of each drive letter, `GetDriveTypeW`
 * and the display areas and system scale `web-apis/screen` reads. The display
 * areas need the Windows App SDK to be running, which a window does.
 *
 * @returns A backend for `createChromeSystem`.
 */
export function windowsSystemBackend() {
  const screen = windowsScreenBackend();
  return {
    cpus: () => cpus(),
    architecture: () => arch(),
    totalMemory: () => totalmem(),
    freeMemory: () => freemem(),
    async drives() {
      const roots = Array.from({ length: LETTER_COUNT }, (_, i) => `${String.fromCodePoint(FIRST_LETTER + i)}:\\`);
      const drives = await Promise.all(roots.map(driveOf));
      return drives.filter(drive => drive !== null);
    },
    displays: screen.source,
    scale: screen.scale
  } satisfies SystemBackend;
}
