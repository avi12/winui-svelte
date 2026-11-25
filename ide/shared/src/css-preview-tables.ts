import { mappingEntries } from "./conversion-table.ts";
import {
  isHandledProperty,
  materials,
  namedEasings,
  shadowDepths,
  unsupportedReasons,
  winuiTargets
} from "./css-ide-data.ts";
import type { PreviewTables } from "./css-previews.ts";

/**
 * The lookup tables the CSS previews read, from the shared IDE data: which CSS property an attribute converts to,
 * the named easings, the shadow depths, the window materials, why a property has no meaning in WinUI, and what each
 * property becomes.
 */
export function previewTables() {
  return {
    attributeProperties: new Map(mappingEntries().map(([name, mapping]) => [name, mapping.cssProperty])),
    easings: namedEasings(),
    shadowDepths: shadowDepths(),
    materials: materials(),
    unsupported: unsupportedReasons(),
    targets: winuiTargets(),
    isHandled: isHandledProperty
  } satisfies PreviewTables;
}
