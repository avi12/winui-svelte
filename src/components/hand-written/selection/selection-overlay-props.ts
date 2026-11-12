import type { ImageSourceInput } from "#src/components/convert.js";
import type { SelectorState } from "#src/selection/selector.js";

/** What `SelectionOverlay` takes. */
export interface SelectionOverlayProps {
  /** The selector the overlay draws; the overlay never changes it. */
  state: SelectorState;

  /** The frozen picture under the scrim, stretched over the whole area. */
  image?: ImageSourceInput;

  /** The corner radius of the cut-out and the brackets; `DEFAULT_SELECTION_RADIUS` by default. */
  radius?: number;

  /** How far each bracket runs along an edge; `DEFAULT_BRACKET_ARM` by default. */
  arm?: number;
}
