import versionsFile from "./versions.json" with { type: "json" };
import { z } from "zod";

const versionSchema = z.object({
  version: z.string().regex(/^5\.\d+\.\d+$/u),
  integrity: z.string().regex(/^sha512-[A-Za-z0-9+/]+=*$/u)
});
const matrixSchema = z.object({
  versions: z.array(versionSchema).min(1)
});

/** The Svelte releases the package is proven against, oldest first, each with the registry's integrity. */
export const SVELTE_MATRIX = matrixSchema.parse(versionsFile).versions;

/** The npm peer range the matrix proves: from its oldest release to its newest. */
export function provenPeerRange() {
  const [oldest] = SVELTE_MATRIX;
  const newest = SVELTE_MATRIX.at(-1);
  return `${oldest?.version} - ${newest?.version}`;
}
