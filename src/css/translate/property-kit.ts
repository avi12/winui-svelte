import type { Declaration } from "./types.ts";
import type { LowerOptions, Reader } from "#src/css/parse/reader.js";

/**
 * What a `write` output sets on the element itself: a grid's columns or rows
 * (a list of lengths), the origin its scale and rotation pivot about
 * (`x,y`, as `parseTransformOrigin` writes it), or that it draws the system's
 * focus visuals.
 */
export type WriteTarget = "columns" | "rows" | "origin" | "focusVisuals";

/**
 * What lowering a group of declarations produces: a Style setter, a
 * collection a Style cannot set (written into the element's XAML), a grid
 * definition list, or the style this one builds on.
 */
export type Output =
  | {
    kind: "setter";
    property: string;
    value: string;
  }
  | {
    kind: "content";
    property: string;
    xaml: string;
  }
  | {
    kind: "write";
    target: WriteTarget;
    value: string;
  }
  | {
    kind: "basedOn";
    key: string;
  };

/** What a group lowers from: the element's declarations and their readers. */
export interface GroupInput {
  options: LowerOptions;
  computed: ReadonlyMap<string, Declaration>;
  readers: ReadonlyMap<string, Reader>;
  /** The reader of a member the group declared and the element has. */
  reading(member: string): Reader;
}

/** The CSS properties that together set one WinUI property, and how they lower. */
export interface PropertyGroup {
  members: readonly string[];
  lower(input: GroupInput): Output[];
}

/** The element types a layout property means something on. */
export const ElementType = {
  STACK_PANEL: "stack-panel",
  GRID: "grid",
  SCROLL_VIEWER: "scroll-viewer"
} as const;

/** A Style setter output. */
export function setter({ property, value }: {
  property: string;
  value: string;
}) {
  return {
    kind: "setter",
    property,
    value
  } as const;
}

/** A keyword table, from CSS's spelling to WinUI's. */
export function enumMap(entries: ReadonlyArray<[string, string]>) {
  return new Map(entries);
}

/** A group of one CSS property to one WinUI property. */
export function simple({ member, property, parse }: {
  member: string;
  property: string;
  parse(reader: Reader): string | null;
}) {
  return {
    members: [member],
    lower(input) {
      const value = parse(input.reading(member));
      return value === null ? [] : [setter({
        property,
        value
      })];
    }
  } satisfies PropertyGroup;
}

/** A property whose value is one color, brush resource or `var()`. */
export function brushProperty({ member, property }: {
  member: string;
  property: string;
}) {
  return simple({
    member,
    property,
    parse(reader) {
      const word = reader.single();
      return word === null ? null : reader.brush(word);
    }
  });
}

/** A property whose value is one length, with keywords (`auto`) that map to a WinUI spelling. */
export function lengthProperty({ member, property, extra = new Map() }: {
  member: string;
  property: string;
  extra?: ReadonlyMap<string, string>;
}) {
  return simple({
    member,
    property,
    parse(reader) {
      const word = reader.single();
      const isWordMissing = word === null;
      if (isWordMissing) {
        return null;
      }

      return extra.get(word.toLowerCase()) ?? reader.length(word);
    }
  });
}

/** A property whose value is one of a fixed set of keywords. */
export function keywordProperty({ member, property, choices }: {
  member: string;
  property: string;
  choices: ReadonlyMap<string, string>;
}) {
  return simple({
    member,
    property,
    parse(reader) {
      const word = reader.single();
      return word === null ? null : reader.keyword({
        token: word,
        choices
      });
    }
  });
}

/** A group whose lowering reads one member and may produce several outputs. */
export function multiple({ member, parse }: {
  member: string;
  parse(reader: Reader): Output[];
}) {
  return {
    members: [member],
    lower: input => parse(input.reading(member))
  } satisfies PropertyGroup;
}

/** A property WinUI has no use for: accepted, reported as a warning and dropped. */
export function ignored({ member, why }: {
  member: string;
  why: string;
}) {
  return {
    members: [member],
    lower(input) {
      input.reading(member).warn(`${member} ignored (${why})`);
      return [];
    }
  } satisfies PropertyGroup;
}
