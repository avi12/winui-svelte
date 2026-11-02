import { FONT_FAMILY_NAMES } from "#src/components/font-family-name.js";
import { LENGTH_UNITS, LengthUnitKind } from "#src/css/parse/units.js";
import {
  DISCRETE_MEMBERS,
  discretePropertyOf,
  discreteValueOf,
  discreteWordsOf
} from "#src/css/translate/discrete-properties.js";
import { GRID_TRACK_PROPERTIES } from "#src/css/translate/grid-track-verdicts.js";
import { CONTROL_KEYWORDS } from "#src/css/translate/text-control-properties.js";
import { WINUI_ONLY_PROPERTIES } from "#src/css/translate/winui-only-properties.js";

const CUSTOM_DATA_VERSION = 1.1;

function unitsOf(kind: LengthUnitKind) {
  return [...LENGTH_UNITS].filter(([, unit]) => unit.kind === kind).map(([name]) => name);
}

const TRACK_DESCRIPTION = "WinUI: a track is auto, a length or an fr size, and they mix freely; repeat(N, ...) is expanded when building. No WinUI equivalent: repeat(auto-fill|auto-fit, ...), subgrid, masonry, named lines and % tracks (the editor's diagnostics say what to write instead).";

const LAYOUT_ALIGNMENT_DESCRIPTION = "WinUI: on a stack panel or grid the build lowers it into the children (each child's align-self or justify-self, or spacer tracks), so it applies to a container written in the component, outside an @media.";

function discreteProperty(member: string) {
  return {
    name: member,
    description: `WinUI: sets ${discretePropertyOf(member)}; only these keywords are accepted.`,
    values: discreteWordsOf(member).map(word => ({
      name: word,
      description: `${discretePropertyOf(member)}: ${discreteValueOf({
        member,
        word
      })}`
    }))
  };
}

/**
 * The VS Code custom data (`css.customData`) for WinUI's CSS dialect, built
 * from the same tables the translation and the validator read: the `-winui-*`
 * properties an editor's own CSS checker does not know, and what WinUI allows
 * for the properties it limits (grid tracks, units, the keywords of a property
 * that takes a fixed set). Written to
 * `vscode-css-data.json` by `scripts/css/export-vscode-css-data.ts`.
 */
export function vscodeCssData() {
  const units = [
    `Native, as written: ${unitsOf(LengthUnitKind.NATIVE).join(", ")}.`,
    `No WinUI equivalent (an error that says what to write): ${unitsOf(LengthUnitKind.UNSUPPORTED).join(", ")}.`
  ].join(" ");
  return {
    version: CUSTOM_DATA_VERSION,
    properties: [
      ...WINUI_ONLY_PROPERTIES.map(property => ({
        name: property.name,
        syntax: property.syntax,
        description: property.syntax === "<length>" ? `${property.description} Units: ${units}` : property.description
      })),
      {
        name: "font-family",
        description: "WinUI: a font family installed on Windows; the names offered here ship with it, any other installed family works as well.",
        values: FONT_FAMILY_NAMES.map(name => ({
          name: `"${name}"`
        }))
      },
      ...DISCRETE_MEMBERS.map(discreteProperty),
      ...[...CONTROL_KEYWORDS].map(([member, spec]) => ({
        name: member,
        description: `WinUI: sets ${spec.property}; only these keywords are accepted.`,
        values: [...spec.choices].map(([word, value]) => ({
          name: word,
          description: `${spec.property}: ${value}`
        }))
      })),
      ...["align-items", "justify-content"].map(name => ({
        name,
        description: LAYOUT_ALIGNMENT_DESCRIPTION
      })),
      ...[...GRID_TRACK_PROPERTIES].map(name => ({
        name,
        description: TRACK_DESCRIPTION
      }))
    ]
  };
}
