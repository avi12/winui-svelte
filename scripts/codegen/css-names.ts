import { propertyGroups } from "#src/css/translate/properties.js";

const cssNames = new Map(
  propertyGroups.flatMap(group => {
    const { property, members } = group;
    const isSingle = property !== undefined && members.length === 1;
    return isSingle ? [[property.toLowerCase(), members[0]] as const] : [];
  })
);

// The sentence of a WinUI property's documentation that names the CSS property
// setting it, or nothing where CSS has none
export function cssNoteOf(winName: string) {
  const cssName = cssNames.get(winName.toLowerCase());
  const isSettable = cssName !== undefined;
  return isSettable ? `Also settable in CSS as \`${cssName}\`` : undefined;
}
