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

  /** The diameter of each grab handle; `DEFAULT_HANDLE_SIZE` by default. */
  handleSize?: number;

  /** The scrim's opacity, 0 to 1, with nothing selected; `DEFAULT_SCRIM_OPACITY` by default. */
  scrimOpacity?: number;

  /** The scrim's opacity once something is selected; `DEFAULT_SELECTED_SCRIM_OPACITY` by default. */
  selectedScrimOpacity?: number;

  /** Called once the `image` has decoded and can be painted; show the window then, so no bare surface flashes. */
  onimageopened?: () => void;

  /** Called with WinUI's error message when the `image` fails to load. */
  onimagefailed?: (error: string) => void;
}
