import type { Declaration } from "./types.ts";
import type { LowerOptions, Reader } from "#src/css/parse/reader.js";
import type { NativeValue } from "#src/native-value.js";

/**
 * What lowering a group of declarations produces: a Style setter, a
 * collection a Style cannot set (written into the element's XAML), something
 * written to the element itself (a grid's `columns` and `rows`, or what a
 * group's `writes` handle), or the style this one builds on.
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
    target: string;
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

/** The write that merges the custom properties of the rules an element matches into its resources. */
export const RESOURCES_TARGET = "resources";

/** Separates the dictionaries of that write, since a write's value is one string. */
export const XAML_SEPARATOR = "\u001F";

/** What a write handler may do to WinUI: the CSS runtime's seam, so it runs under `node --test`. */
export interface WriteSeam {
  /** XamlReader.load of a ResourceDictionary. */
  loadDictionary(xaml: string): object;
  /** Merges a dictionary into the control's own Resources (its template reads them); returns what undoes it. */
  mergeIntoControl(control: object, dictionary: object): () => void;
  /** A grid's columns or rows, from "Auto,*,2*,120" (empty clears them). */
  setGridDefinitions(control: object, target: "columns" | "rows", lengths: string): void;
  /**
   * Sets the composition property (`COMPOSITION_PROPERTIES`) from "x,y,z" (or the angle) once the
   * control has loaded; returns what puts the property back.
   */
  setComposition(input: {
    control: object;
    property: string;
    value: string;
  }): () => void;
  /**
   * Gives the control an implicit transition of its own (`OpacityTransition`),
   * made from its XAML, once the control has loaded; returns what takes it off.
   */
  setTransition(input: {
    control: object;
    property: string;
    xaml: string;
  }): () => void;
  /** Assigns properties of the control (`{ centerPoint: ... }`). */
  assign(control: object, values: Readonly<Record<string, unknown>>): void;
  /** Calls `handler` on a WinUI event (PointerEntered...); null if the control has no such event. */
  subscribe(control: object, event: string, handler: () => void): (() => void) | null;
  read(input: {
    control: object;
    property: string;
  }): NativeValue;
  /**
   * Begins Storyboards (XAML) on the control. `hasTransform` gives it a
   * CompositeTransform as RenderTransform, and each of `brushes` a SolidColorBrush
   * of its own (of the given color) to animate; returns what stops the
   * storyboards and puts back what they replaced.
   */
  animate(input: {
    control: object;
    storyboards: readonly {
      xaml: string;
      isPaused: boolean;
    }[];
    hasTransform: boolean;
    brushes: readonly {
      property: string;
      color: string;
    }[];
  }): () => void;
}

/** What a write handler is given: the control, the value the group wrote, and the seam. */
export interface WriteContext {
  control: object;
  value: string;
  native: WriteSeam;
  /** Writes the element's text again, through `textTransforms`, after a transform was set or removed. */
  refreshText(): void;
}

/** Applies a `write` to a control; returns what undoes it when the write changes or the element goes. */
export type WriteHandler = (context: WriteContext) => (() => void) | null;

/** What an expansion reads: the shorthand declaration and a reader over its value. */
export interface ExpansionInput {
  declaration: Declaration;
  reader: Reader;
}

/** Turns a shorthand declaration into the longhands the property table lowers. */
export type Expansion = (input: ExpansionInput) => Declaration[];

/** The CSS properties that together set one WinUI property, and how they lower. */
export interface PropertyGroup {
  members: readonly string[];
  /** The WinUI property a group of one member sets, for the documentation that names the CSS one */
  property?: string;
  /** Whether the built-in groups win over this one where both set a WinUI property (an opt-in one wins by default) */
  isFallback?: boolean;
  lower(input: GroupInput): Output[];
  /** Shorthands whose longhands are among the members. */
  shorthands?: ReadonlyMap<string, Expansion>;
  /** How the runtime applies the `write` outputs the group produces, by target. */
  writes?: Readonly<Record<string, WriteHandler>>;
}

/**
 * The WinUI properties of the element's composition visual (a Vector3 or the
 * rotation). A Style setter for one, applied before the element has loaded,
 * hangs or crashes the window, so they are written to the element once it has.
 */
export const COMPOSITION_PROPERTIES: ReadonlySet<string> = new Set(["Translation", "Scale", "Rotation"]);

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
export function enumMap(entries: readonly [string, string][]) {
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
    property,
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
