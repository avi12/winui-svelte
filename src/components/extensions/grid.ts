import { gridLengthOf } from "#src/components/convert.js";
import { ColumnDefinition, RowDefinition } from "#src/components/generated/bindings.js";
import type { Grid } from "#src/components/generated/bindings.js";
import type { Linker } from "#src/components/runtime.svelte.js";
import { trackListParts } from "#src/components/values.js";

// Hand-written props of the generated Grid: WinUI's ColumnDefinitions and
// RowDefinitions are read-only collections, which the generator leaves out
// (tables.ts, extendedClasses). A string lists the lengths, as XAML's
// shorthand and the raw <grid columns="..."> element do.
//
//   <Grid columns="Auto,*,Auto" rows="Auto,Auto">

/** The props the metadata cannot give the generated Grid. */
export interface GridExtras {
  // "Auto", "*", "2*" or a number of pixels, separated by commas; a track may
  // end in a minimum and a maximum, "*:100" or "Auto::300".
  columns?: string;
  rows?: string;
}

type Definition = ColumnDefinition | RowDefinition;

// The tracks replace the definitions the grid holds.
function define<Item extends Definition>({ definitions, make, lengths }: {
  definitions: {
    clear(): void;
    append(item: Item): void;
  };
  make: (track: Track) => Item;
  lengths: string;
}) {
  definitions.clear();
  for (const track of trackListParts(lengths)) {
    definitions.append(make(track));
  }
}

type Track = ReturnType<typeof trackListParts>[number];

function column(track: Track) {
  const definition = new ColumnDefinition();
  definition.width = gridLengthOf(track.length);
  definition.minWidth = track.min ?? 0;
  definition.maxWidth = track.max ?? Infinity;
  return definition;
}

function row(track: Track) {
  const definition = new RowDefinition();
  definition.height = gridLengthOf(track.length);
  definition.minHeight = track.min ?? 0;
  definition.maxHeight = track.max ?? Infinity;
  return definition;
}

/** Links the Grid's `columns` and `rows` props to its column and row definitions. */
export function linkGridExtras({ control, props, link }: {
  control: Grid;
  props: GridExtras;
  link: Linker;
}) {
  link.property({
    props,
    key: "columns",
    apply(lengths) {
      define({
        definitions: control.columnDefinitions,
        make: column,
        lengths
      });
    }
  });
  link.property({
    props,
    key: "rows",
    apply(lengths) {
      define({
        definitions: control.rowDefinitions,
        make: row,
        lengths
      });
    }
  });
}
