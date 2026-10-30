import { LENGTH_UNITS, LengthUnitKind } from "#src/css/parse/units.js";
import { GRID_TRACK_PROPERTIES } from "#src/css/translate/grid-track-verdicts.js";
import { WINUI_ONLY_PROPERTIES } from "#src/css/translate/winui-only-properties.js";

const CUSTOM_DATA_VERSION = 1.1;

function unitsOf(kind: LengthUnitKind) {
  return [...LENGTH_UNITS].filter(([, unit]) => unit.kind === kind).map(([name]) => name);
}

const TRACK_DESCRIPTION = "WinUI: a track is auto, a length or an fr size, and they mix freely; repeat(N, ...) is expanded when building. No WinUI equivalent: repeat(auto-fill|auto-fit, ...), subgrid, masonry, named lines and % tracks (the editor's diagnostics say what to write instead).";

/**
 * The VS Code custom data (`css.customData`) for WinUI's CSS dialect, built
 * from the same tables the translation and the validator read: the `-winui-*`
 * properties an editor's own CSS checker does not know, and what WinUI allows
 * for the properties it limits (grid tracks, units). Written to
 * `vscode-css-data.json` by `scripts/css/export-vscode-css-data.ts`.
 */
export function vscodeCssData() {
  const units = [
    `Converted to px when building: ${unitsOf(LengthUnitKind.BUILD).join(", ")}.`,
    `Resolved at layout, inside calc(), min(), max() or clamp(): ${unitsOf(LengthUnitKind.RUNTIME).join(", ")}.`,
    `No WinUI equivalent (an error): ${unitsOf(LengthUnitKind.UNSUPPORTED).join(", ")}.`
  ].join(" ");
  return {
    version: CUSTOM_DATA_VERSION,
    properties: [
      ...WINUI_ONLY_PROPERTIES.map(property => ({
        name: property.name,
        syntax: property.syntax,
        description: property.syntax === "<length>" ? `${property.description} Units: ${units}` : property.description
      })),
      ...[...GRID_TRACK_PROPERTIES].map(name => ({
        name,
        description: TRACK_DESCRIPTION
      }))
    ]
  };
}
