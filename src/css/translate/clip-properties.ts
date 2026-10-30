import type { GroupInput, PropertyGroup } from "./property-kit.ts";
import type { VisualHost } from "./visual-effect-properties.ts";
import { parseClipPath, readClipShape } from "#src/css/parse/clip-shapes.js";

// `clip-path`: `inset()` (with `round`), `circle()`, `ellipse()`, `polygon()` and
// `path()`, as the Composition clip of the element's visual (a CompositionGeometricClip:
// UIElement.Clip takes only a RectangleGeometry).

const CLIP_PATH = "clip-path";
const CLIP_TARGET = "clip-shape";

function lowerClipPath(input: GroupInput) {
  const reader = input.reading(CLIP_PATH);
  const result = parseClipPath(reader.declaration.value);
  if (!result.isValid) {
    reader.error(`${CLIP_PATH}: ${result.reason}`);
    return [];
  }

  const { shape } = result;
  return shape === null ? [] : [{
    kind: "write",
    target: CLIP_TARGET,
    value: JSON.stringify(shape)
  } as const];
}

/**
 * The property group of `clip-path`. Apart from the built-in groups, so a
 * window whose sheets have none carries none of it (and none of Win2D). `host`
 * is what clips: the window's is `winui-svelte/css/clip`'s; the build needs none.
 */
export function clipGroups(host?: VisualHost) {
  return [{
    members: [CLIP_PATH],
    lower: lowerClipPath,
    writes: {
      [CLIP_TARGET]({ control, value }) {
        const isHostMissing = host === undefined;
        if (isHostMissing) {
          return null;
        }

        host.setClip({
          control,
          shape: readClipShape(value)
        });
        return () => host.setClip({
          control,
          shape: null
        });
      }
    }
  }] satisfies PropertyGroup[];
}

/** The members the clip group is lowered from. */
export const CLIP_MEMBERS = [CLIP_PATH];
