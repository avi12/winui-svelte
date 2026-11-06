import { translation } from "./motion-properties.ts";
import { setter } from "./property-kit.ts";
import type { GroupInput, PropertyGroup } from "./property-kit.ts";
import { SHADOW_CAST_ON, SHADOW_MODE, ShadowMode } from "./shadow-mode.ts";
import { parseShadowLayer } from "#src/css/parse/box-shadow.js";
import { Reader } from "#src/css/parse/reader.js";
import { splitCommas } from "#src/css/parse/values.js";

const ELEVATION = "-winui-elevation";
const BOX_SHADOW = "box-shadow";

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
  const hasReceivers = input.computed.has(SHADOW_CAST_ON);
  if (!hasReceivers) {
    reader.warn(`${reader.declaration.property}: a ThemeShadow draws with no receivers on Windows 11 and later; earlier, it draws only on elements named in its Receivers, which a Style cannot set (-winui-shadow-cast-on names a group of them)`);
  }

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
 * counterpart. `-winui-elevation` wins where both are written. With
 * `-winui-shadow: composition` the shadow group draws it instead, and this
 * group lowers nothing.
 */
function boxShadow(input: GroupInput) {
  const reader = input.reading(BOX_SHADOW);
  const isComposition = input.computed.get(SHADOW_MODE)?.value.trim().toLowerCase() === ShadowMode.COMPOSITION;
  const [first = ""] = splitCommas(reader.declaration.value);
  const isNone = first.trim().toLowerCase() === "none";
  const isLoweredElsewhere = isComposition || isNone;
  if (isLoweredElsewhere) {
    return [];
  }

  const shadow = parseShadowLayer(first);
  const isShadowMissing = shadow === null;
  if (isShadowMissing) {
    reader.expected("offset-x offset-y [blur [spread]] [color]");
    return [];
  }

  if (shadow.isInset) {
    reader.error(`${BOX_SHADOW}: inset has no WinUI meaning (a ThemeShadow is cast outside the element)`);
    return [];
  }

  const depth = shadow.blur > 0 ? shadow.blur : Math.max(Math.abs(shadow.x), Math.abs(shadow.y));
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
