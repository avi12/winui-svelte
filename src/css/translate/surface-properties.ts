import { translation } from "./motion-properties.ts";
import { setter } from "./property-kit.ts";
import type { GroupInput, PropertyGroup } from "./property-kit.ts";
import { parseColor } from "#src/css/parse/colors.js";
import { Reader } from "#src/css/parse/reader.js";
import { parseLength, splitWords } from "#src/css/parse/values.js";

const ELEVATION = "-winui-elevation";
const BACKDROP = "backdrop-filter";
const BLUR = /^blur\((.*)\)$/iu;
const ARGB_LENGTH = 9;
const ALPHA_DIGITS = 2;
const HEX_RADIX = 16;
const MAX_ALPHA = 255;
const OPACITY_DIGITS = 3;

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

/**
 * `-winui-elevation`: a length in px, the depth of a ThemeShadow. It sets the
 * element's Shadow to a ThemeShadow and the Z of its Translation to the depth
 * (WinUI draws the shadow from how far the element is lifted: 16 for a card, 32
 * for a flyout). WinUI's shadow has no blur, offset, spread or color to set, so
 * `box-shadow` is not read. Windows 11 casts the shadow with no more; before it
 * (or with an app that targets an older Windows SDK) a ThemeShadow draws only on
 * the elements in its Receivers, which a Style cannot name.
 */
function elevation(input: GroupInput) {
  const reader = input.reading(ELEVATION);
  const word = reader.single();
  const depth = word === null ? null : reader.pixels(word);
  const isDepthMissing = depth === null;
  if (isDepthMissing) {
    return [];
  }

  reader.warn(`${ELEVATION}: a ThemeShadow draws with no receivers on Windows 11 and later; earlier, it draws only on elements named in its Receivers, which a Style cannot set`);
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

// `#AARRGGBB` as its color and its opacity; a 6 digit color is opaque.
function tintOf(color: string) {
  const isArgb = color.length === ARGB_LENGTH;
  if (!isArgb) {
    return {
      color,
      opacity: 1
    };
  }

  const alpha = Number.parseInt(color.slice(1, 1 + ALPHA_DIGITS), HEX_RADIX) / MAX_ALPHA;
  return {
    color: `#${color.slice(1 + ALPHA_DIGITS)}`,
    opacity: Number(alpha.toFixed(OPACITY_DIGITS))
  };
}

/**
 * `backdrop-filter: blur(...)`: the Background becomes an AcrylicBrush, which
 * blurs what is behind the element. WinUI's acrylic has a blur of its own, so
 * the radius is ignored (said in a warning); the tint is the `background-color`,
 * as the translucent color CSS writes beside a backdrop blur.
 */
function backdropFilter(input: GroupInput) {
  const reader = input.reading(BACKDROP);
  const words = splitWords(reader.declaration.value);
  const isBlur = words.length === 1 && BLUR.test(words[0] ?? "");
  const isNone = words.length === 1 && words[0]?.toLowerCase() === "none";
  if (isNone) {
    return [];
  }

  if (!isBlur) {
    reader.error(`${BACKDROP}: ${reader.declaration.value} has no WinUI meaning (only blur() has: an acrylic brush blurs what is behind it)`);
    return [];
  }

  const radius = BLUR.exec(words[0] ?? "")?.[1] ?? "";
  const isRadiusValid = parseLength(radius.trim()) !== null;
  if (!isRadiusValid) {
    reader.expectedToken({
      what: "a blur radius in px",
      token: radius
    });
    return [];
  }

  reader.warn(`${BACKDROP}: the blur radius is ignored (an AcrylicBrush blurs by its own amount)`);
  const background = input.computed.get("background-color");
  const color = background === undefined ? null : parseColor(background.value);
  const tint = color === null ? null : tintOf(color);
  const isUntinted = tint === null;
  if (isUntinted) {
    reader.warn(`${BACKDROP}: with no literal background-color the acrylic has no tint`);
  }

  const attributes = tint === null ? "" : ` TintColor="${tint.color}" TintOpacity="${tint.opacity}" FallbackColor="${tint.color}"`;
  return [{
    kind: "content",
    property: "Background",
    xaml: `<AcrylicBrush${attributes}/>`
  } as const];
}

/**
 * The property groups of `-winui-elevation` and `backdrop-filter`. Apart from
 * the built-in groups, as the gradients are: a sheet that uses one registers
 * them (`registerPropertyGroups`), so a window with none carries no parser.
 */
export function surfaceGroups() {
  return [
    {
      members: [ELEVATION],
      lower: elevation
    },
    {
      members: [BACKDROP],
      lower: backdropFilter
    }
  ] satisfies PropertyGroup[];
}

/** The members the surface groups are lowered from. */
export const SURFACE_MEMBERS = [ELEVATION, BACKDROP];
