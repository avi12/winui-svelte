import type { GroupInput, PropertyGroup, WriteContext, WriteHandler } from "./property-kit.ts";
import {
  SHADOW_CAST_ON,
  SHADOW_MODE,
  SHADOW_RECEIVER,
  ShadowMode,
  ShadowRole
} from "./shadow-mode.ts";
import { DEFAULT_SHADOW_COLOR, parseShadowList, readShadowLayers } from "#src/css/parse/box-shadow.js";
import type { ShadowLayer } from "#src/css/parse/box-shadow.js";
import type { Reader } from "#src/css/parse/reader.js";

// `-winui-shadow: composition` draws `box-shadow` with a Composition
// DropShadow (colour, offset, blur and spread); `-winui-shadow-receiver` and
// `-winui-shadow-cast-on` name the elements a ThemeShadow falls on. They are
// one group because the shadow modes and the receivers are the one feature the
// ThemeShadow lacks; the surface group (`-winui-elevation`, `box-shadow`)
// stays the default and lowers nothing of a `box-shadow` this group draws.

const BOX_SHADOW = "box-shadow";
const LAYERS_TARGET = "drop-shadows";
const GROUP_TARGET_PREFIX = "shadow-group:";
const GROUP_NAME = /^[a-z][\w-]*$/iu;
const MODES: ReadonlyMap<string, ShadowMode> = new Map(Object.values(ShadowMode).map(mode => [mode, mode]));
const ROLES: ReadonlyMap<string, ShadowRole> = new Map([
  [SHADOW_RECEIVER, ShadowRole.RECEIVER],
  [SHADOW_CAST_ON, ShadowRole.CASTER]
]);

/** What a window does to an element's shadows: the seam of the write handlers, so they run under `node --test`. */
export interface ShadowHost {
  /** Draws the control with these shadows, or with none for an empty list. */
  setLayers(input: {
    control: object;
    layers: readonly ShadowLayer[];
  }): void;

  /** Puts the control in a shadow group as a caster or a receiver; returns what takes it out. */
  join(input: {
    control: object;
    name: string;
    role: ShadowRole;
  }): () => void;
}

function layersOf(reader: Reader) {
  const parsed = parseShadowList(reader.declaration.value);
  const isParsedMissing = parsed === null;
  if (isParsedMissing) {
    reader.expected("offset-x offset-y [blur [spread]] [color], separated by commas");
    return [];
  }

  const layers: ShadowLayer[] = [];
  for (const layer of parsed) {
    if (layer.isInset) {
      reader.error(`${BOX_SHADOW}: inset is not drawn: a Composition shadow is cast outside the element, and an inner shadow needs the element's own pixels`);
    } else if (layer.hasUnresolvedColor) {
      reader.error(`${BOX_SHADOW}: a Composition shadow takes a colour written out (#rrggbb, rgb(), hsl() or a name), since a theme resource cannot be read when the sheet is built`);
    } else if (layer.blur < 0) {
      reader.error(`${BOX_SHADOW}: the blur radius cannot be negative`);
    } else {
      layers.push({
        x: layer.x,
        y: layer.y,
        blur: layer.blur,
        spread: layer.spread,
        color: layer.color ?? DEFAULT_SHADOW_COLOR
      });
    }
  }

  return layers;
}

function lowerShadow(input: GroupInput) {
  const mode = input.readers.get(SHADOW_MODE);
  const isModeWritten = mode !== undefined;
  const modeWord = isModeWritten ? mode.single() : null;
  const isModeKnown = modeWord !== null && MODES.has(modeWord.toLowerCase());
  const isModeRefused = isModeWritten && !isModeKnown;
  if (isModeRefused) {
    mode.expected(`one of ${[...MODES.keys()].join(", ")}`);
    return [];
  }

  const reader = input.readers.get(BOX_SHADOW);
  const isComposition = modeWord?.toLowerCase() === ShadowMode.COMPOSITION;
  const isIdle = !isComposition || reader === undefined;
  if (isIdle) {
    return [];
  }

  const layers = layersOf(reader);
  return layers.length === 0 ? [] : [{
    kind: "write",
    target: LAYERS_TARGET,
    value: JSON.stringify(layers)
  } as const];
}

function lowerGroupMember({ input, member }: {
  input: GroupInput;
  member: string;
}) {
  const reader = input.reading(member);
  const word = reader.single();
  const isWordMissing = word === null;
  if (isWordMissing) {
    return [];
  }

  const isName = GROUP_NAME.test(word);
  if (!isName) {
    reader.expected("a name (letters, digits, - and _)");
    return [];
  }

  const isCaster = member === SHADOW_CAST_ON;
  const hasShadow = input.computed.has("-winui-elevation") || input.computed.has(BOX_SHADOW);
  const isShadowMissing = isCaster && !hasShadow;
  if (isShadowMissing) {
    reader.warn(`${member}: the receivers belong to the element's ThemeShadow, which -winui-elevation sets`);
  }

  return [{
    kind: "write",
    target: `${GROUP_TARGET_PREFIX}${member}`,
    value: word
  } as const];
}

function joinHandler({ host, member }: {
  host: ShadowHost | undefined;
  member: string;
}) {
  const role = ROLES.get(member);
  return function join({ control, value }: WriteContext) {
    const isHostMissing = host === undefined || role === undefined;
    if (isHostMissing) {
      return null;
    }

    return host.join({
      control,
      name: value,
      role
    });
  } satisfies WriteHandler;
}

/**
 * The property group of `-winui-shadow`, `-winui-shadow-receiver` and
 * `-winui-shadow-cast-on`, and of the `box-shadow` they read. Apart from the
 * built-in groups, so a window whose sheets use none carries none of it (and
 * none of Win2D). `host` is what draws: the window's is
 * `winui-svelte/css/shadow`'s; the build needs none.
 */
export function shadowGroups(host?: ShadowHost) {
  return [
    {
      members: [SHADOW_MODE, BOX_SHADOW],
      lower: lowerShadow,
      writes: {
        [LAYERS_TARGET]({ control, value }) {
          const isHostMissing = host === undefined;
          if (isHostMissing) {
            return null;
          }

          host.setLayers({
            control,
            layers: readShadowLayers(value)
          });
          return () => host.setLayers({
            control,
            layers: []
          });
        }
      }
    },
    ...[SHADOW_RECEIVER, SHADOW_CAST_ON].map(member => ({
      members: [member],
      lower: (input: GroupInput) => lowerGroupMember({
        input,
        member
      }),
      writes: {
        [`${GROUP_TARGET_PREFIX}${member}`]: joinHandler({
          host,
          member
        })
      }
    }))
  ] satisfies PropertyGroup[];
}

/** The members whose presence in a sheet loads the shadow group (`box-shadow` alone is the surface group's). */
export const SHADOW_MEMBERS = [SHADOW_MODE, SHADOW_RECEIVER, SHADOW_CAST_ON];
