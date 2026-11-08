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

const trayManifestFileSchema = z.union([
  trayManifestSchema,
  z.object({ trays: z.array(trayManifestSchema).min(1) })
]);

/**
 * Checks one tray read from a tray entrypoint's literals: the icon file, the
 * tooltip and the guid.
 *
 * @param value - The parsed object.
 * @returns The manifest of that tray.
 * @throws {Error} When it is not a manifest.
 */
export function parseTrayManifest(value: unknown) {
  return trayManifestSchema.parse(value);
}

/**
 * Reads the whole of `tray.json`: one tray's manifest, or `{ trays }` when
 * the entrypoint defines several.
 *
 * @param value - The parsed JSON.
 * @returns The trays, in the order the entrypoint lists them.
 * @throws {Error} When it is neither shape.
 */
export function parseTrayManifestFile(value: unknown) {
  const file = trayManifestFileSchema.parse(value);
  return "trays" in file ? file.trays : [file];
}

/**
 * What `tray.json` holds for these trays: the manifest itself for one tray (the
 * shape every build wrote before there could be several), `{ trays }` for more.
 *
 * @param trays - The manifests, in order.
 * @returns The value to write as JSON.
 */
export function trayManifestFileOf(trays: ReadonlyArray<ReturnType<typeof parseTrayManifest>>) {
  const [only, ...others] = trays;
  const isSingle = only !== undefined && others.length === 0;
  return isSingle ? only : { trays };
}

/**
 * The `guid` that names the one tray process of an entrypoint: its first
 * tray's, so the order of the list is part of the identity. `tray.js` claims
 * the same one (`trays[0].guid` in the wrapper that `trayWrapperSource` writes).
 *
 * @param trays - The manifests, in order.
 * @returns The guid.
 */
export function processGuidOf(trays: ReturnType<typeof parseTrayManifestFile>) {
  const [first] = trays;
  const isEmpty = first === undefined;
  if (isEmpty) {
    throw new Error("a tray entrypoint defines at least one tray");
  }

  return first.guid;
}
