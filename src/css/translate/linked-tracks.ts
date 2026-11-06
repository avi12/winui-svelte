import type { Track } from "./animation-tracks.ts";
import { LinkedProperty } from "./scroll-link.ts";
import type { LinkedTrack } from "./scroll-link.ts";

// Which of an animation's tracks Composition can drive from a scroll position:
// the ones that are a property of the element's visual (opacity, translation,
// scale and rotation), not of the layout or of a brush.

const TRANSFORM_COMPONENT = /^\(UIElement\.RenderTransform\)\.\(CompositeTransform\.(\w+)\)$/u;
const OPACITY = "Opacity";
const COMPOSITION_PROPERTIES: ReadonlyMap<string, LinkedProperty> = new Map([
  [OPACITY, LinkedProperty.OPACITY],
  ["TranslateX", LinkedProperty.TRANSLATION_X],
  ["TranslateY", LinkedProperty.TRANSLATION_Y],
  ["ScaleX", LinkedProperty.SCALE_X],
  ["ScaleY", LinkedProperty.SCALE_Y],
  ["Rotation", LinkedProperty.ROTATION]
]);

/** What a scroll-linked animation can drive, for the error that names what it cannot. */
export const LINKABLE = "opacity, translate, scale and rotate (and a transform made of translate(), scale() and rotate())";

function propertyOf(track: Track) {
  const component = TRANSFORM_COMPONENT.exec(track.target)?.[1];
  return COMPOSITION_PROPERTIES.get(component ?? track.target) ?? null;
}

/**
 * The tracks as properties Composition drives, and the `Storyboard` targets of
 * those it cannot (a width, a color, a keyword, a skew).
 */
export function linkedTracksOf(tracks: readonly Track[]) {
  const linked: LinkedTrack[] = [];
  const unsupported: string[] = [];
  for (const track of tracks) {
    const property = propertyOf(track);
    const isUnsupported = property === null;
    if (isUnsupported) {
      unsupported.push(track.target);
      continue;
    }

    linked.push({
      property,
      frames: track.frames.map(({ offset, value }) => ({
        offset,
        value: Number(value)
      }))
    });
  }

  return {
    linked,
    unsupported
  };
}
