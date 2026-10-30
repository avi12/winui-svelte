import { translation } from "./motion-properties.ts";
import { setter } from "./property-kit.ts";
import type { GroupInput, PropertyGroup } from "./property-kit.ts";
import { Reader } from "#src/css/parse/reader.js";
import { parseLength, splitCommas, splitWords } from "#src/css/parse/values.js";

const ELEVATION = "-winui-elevation";
const BOX_SHADOW = "box-shadow";
const MIN_SHADOW_LENGTHS = 2;
const MAX_SHADOW_LENGTHS = 4;

// The Z of Translation is a ThemeShadow's depth; the X and Y are what `translate`
// says, read again without reporting (the translate group has reported already).
function translationWithDepth({ input, depth }: {
  input: GroupInput;
  depth: number;
}) {
  const declaration = input.computed.get("translate");
  const silent = {
    ...input.options,
    report() {}
  };
  const lengths = declaration === undefined ? [] : translation(new Reader(declaration, silent));
  const [first] = lengths;
  const [x = "0", y = "0"] = first?.kind === "setter" ? first.value.split(",") : [];
  return setter({
    property: "Translation",
    value: `${x},${y},${depth}`
  });
}

// A ThemeShadow of this depth: the Shadow, and the Z of the Translation.
function themeShadow({ input, reader, depth }: {
  input: GroupInput;
  reader: Reader;
  depth: number;
}) {
  reader.warn(`${reader.declaration.property}: a ThemeShadow draws with no receivers on Windows 11 and later; earlier, it draws only on elements named in its Receivers, which a Style cannot set`);
  return [
    {
      kind: "content",
      property: "Shadow",
      xaml: "<ThemeShadow/>"
    } as const,
    translationWithDepth({
      input,
      depth
    })
  ];
}

/**
 * `-winui-elevation`: a length in px, the depth of a ThemeShadow. It sets the
 * element's Shadow to a ThemeShadow and the Z of its Translation to the depth
 * (WinUI draws the shadow from how far the element is lifted: 16 for a card, 32
 * for a flyout). WinUI's shadow has no blur, offset, spread or color to set.
 * Windows 11 casts the shadow with no more; before it (or with an app that
 * targets an older Windows SDK) a ThemeShadow draws only on the elements in its
 * Receivers, which a Style cannot name.
 */
function elevation(input: GroupInput) {
  const reader = input.reading(ELEVATION);
  const word = reader.single();
  const depth = word === null ? null : reader.pixels(word);
  const isDepthMissing = depth === null;
  if (isDepthMissing) {
    return [];
  }

  return themeShadow({
    input,
    reader,
    depth
  });
}

/**
 * `box-shadow`: the first shadow of the list becomes a ThemeShadow whose depth
 * is its blur radius (or its larger offset when it has no blur). WinUI's shadow
 * takes no offset, spread or color, which a warning says; `inset` has no
 * counterpart. `-winui-elevation` wins where both are written.
 */
function boxShadow(input: GroupInput) {
  const reader = input.reading(BOX_SHADOW);
  const [first = ""] = splitCommas(reader.declaration.value);
  const words = splitWords(first);
  const isNone = words.length === 1 && words[0]?.toLowerCase() === "none";
  if (isNone) {
    return [];
  }

  const isInset = words.some(word => word.toLowerCase() === "inset");
  if (isInset) {
    reader.error(`${BOX_SHADOW}: inset has no WinUI meaning (a ThemeShadow is cast outside the element)`);
    return [];
  }

  const lengths = words.map(word => parseLength(word)).filter(length => length !== null);
  const isShadowRead = lengths.length >= MIN_SHADOW_LENGTHS && lengths.length <= MAX_SHADOW_LENGTHS;
  if (!isShadowRead) {
    reader.expected("offset-x offset-y [blur [spread]] [color]");
    return [];
  }

  const [offsetX = 0, offsetY = 0, blur = 0] = lengths;
  const depth = blur > 0 ? blur : Math.max(Math.abs(offsetX), Math.abs(offsetY));
  const hasMore = splitCommas(reader.declaration.value).length > 1;
  if (hasMore) {
    reader.warn(`${BOX_SHADOW}: only the first shadow is used (an element has one Shadow)`);
  }

  return themeShadow({
    input,
    reader,
    depth
  });
}

/**
 * The property groups of `-winui-elevation` and `box-shadow`. Apart from
 * the built-in groups, as the gradients are: a sheet that uses one registers
 * them (`registerPropertyGroups`), so a window with none carries no parser.
 */
export function surfaceGroups() {
  return [
    {
      members: [BOX_SHADOW],
      lower: boxShadow
    },
    {
      members: [ELEVATION],
      lower: elevation
    }
  ] satisfies PropertyGroup[];
}

/** The members the surface groups are lowered from. */
export const SURFACE_MEMBERS = [ELEVATION, BOX_SHADOW];
