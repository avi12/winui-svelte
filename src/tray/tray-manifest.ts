import { z } from "zod";

/** The file the bundle of a tray entrypoint is written to. */
export const TRAY_BUNDLE_FILE = "tray.js";

/** The file next to it that says what the build read from `tray.ts` without running it. */
export const TRAY_MANIFEST_FILE = "tray.json";

const trayManifestSchema = z.object({
  icon: z.string().min(1),
  tooltip: z.string().optional(),
  guid: z.string().min(1)
});

/**
 * Checks a value read from `tray.json`, or extracted from a tray entrypoint's
 * literals: the icon file, the tooltip and the guid.
 *
 * @param value - The parsed JSON.
 * @returns The manifest.
 * @throws {Error} When it is not a manifest.
 */
export function parseTrayManifest(value: unknown) {
  return trayManifestSchema.parse(value);
}
