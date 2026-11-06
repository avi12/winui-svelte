import { customPropertyOf, ResourceKind } from "#src/css/runtime/resources.js";
import { readFileSync } from "node:fs";
import path from "node:path";
import { z } from "zod";

// The WinUI resource names a `var(--...)` can name, each with the color it
// shows in the light and the dark theme where it has one: from the two files
// scripts/css/export-winui-resources.ts writes.

const PACKAGE_ROOT = path.join(import.meta.dirname, "..", "..");
const RESOURCES_FILE = path.join(PACKAGE_ROOT, "src", "css", "winui-resources.g.json");
const SWATCHES_FILE = path.join(PACKAGE_ROOT, "scripts", "css", "winui-swatches.g.json");
const NOT_A_VALUE = new Set<string>([ResourceKind.STYLE]);

const swatchesSchema = z.record(z.string(), z.tuple([z.string().nullable(), z.string().nullable()]));

function namesOfKinds() {
  const catalogue: Record<string, unknown> = JSON.parse(readFileSync(RESOURCES_FILE, "utf8"));
  return Object.values(ResourceKind).filter(kind => !NOT_A_VALUE.has(kind)).flatMap(kind => {
    const names = z.array(z.string()).parse(catalogue[kind]);
    return names.map(name => ({
      name,
      kind
    }));
  });
}

/** The resources a `var(--name)` can name, in name order, with the swatch of those that are colors. */
export function resourceData() {
  const swatches = swatchesSchema.parse(JSON.parse(readFileSync(SWATCHES_FILE, "utf8")));
  return namesOfKinds().map(({ name, kind }) => {
    const [light, dark] = swatches[name] ?? [null, null];
    return {
      name,
      property: customPropertyOf(name),
      kind,
      ...light !== null && {
        light
      },
      ...dark !== null && {
        dark
      }
    };
  });
}
