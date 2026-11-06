import type { IdeData } from "#scripts/ide/ide-data.ts";

// The values an enum prop completes to, from the editors' data set
// (scripts/ide/generate-ide-data.ts): the text written in the markup, which is a
// string set's value (`backdrop="mica"`) and a WinUI enum's member name
// (`clickMode="Hover"`), each with the first sentence of its documentation.

const ENUM_NAME_SUFFIX = "Name";

/** The closed sets by the name `winui-svelte/enums` exports them under. */
export function enumSetsOf(data: IdeData) {
  return new Map(data.enums.map(set => [set.name, set]));
}

/** The values of the set a prop's `...Name` type (or the set's own name) stands for; none when the set is unknown. */
export function enumValuesOf({ sets, typeName }: {
  sets: ReadonlyMap<string, IdeData["enums"][number]>;
  typeName: string;
}) {
  const isNamesType = typeName.endsWith(ENUM_NAME_SUFFIX);
  const set = sets.get(isNamesType ? typeName.slice(0, -ENUM_NAME_SUFFIX.length) : typeName);
  return set?.members.map(member => ({
    name: set.isNumeric ? member.name : String(member.value),
    ...member.description !== undefined && {
      description: member.description
    }
  }));
}
