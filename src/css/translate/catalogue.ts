import { createCatalogue } from "#src/css/runtime/resources.js";
import type { NativeValue } from "#src/native-value.js";
import { isRecord } from "#src/renderer/host/reflect.js";
import { readFileSync } from "node:fs";

const catalogueFile = new URL("../winui-resources.g.json", import.meta.url);

function isNameList(value: NativeValue): value is string[] {
  return Array.isArray(value) && value.every(name => typeof name === "string");
}

/**
 * Loads the catalogue of WinUI's own resources from `winui-resources.g.json`,
 * which `scripts/css/export-winui-resources.ts` writes. Node only: it runs
 * where the Vite plugin and the tests do, and in the window the first time a
 * `resources` prop is given a record. It checks the file by hand rather than
 * with a schema, since the window carries this module.
 */
export function loadWinuiCatalogue() {
  const catalogue: NativeValue = JSON.parse(readFileSync(catalogueFile, "utf8"));
  if (!isRecord(catalogue)) {
    throw new TypeError(`${catalogueFile.pathname} is not a resource catalogue`);
  }

  // A kind whose keys are not a list of strings is left out.
  const groups: Record<string, string[]> = {};
  for (const [kind, keys] of Object.entries(catalogue)) {
    if (isNameList(keys)) {
      groups[kind] = keys;
    }
  }

  return createCatalogue({ groups });
}
