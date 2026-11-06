import type { CompositionContainerVisual } from "#winui/microsoft/ui/composition/ContainerVisual";
import { ElementCompositionPreview } from "#winui/microsoft/ui/xaml/hosting/ElementCompositionPreview";
import type { UIElement } from "#winui/microsoft/ui/xaml/UIElement";

// An element has one child-visual slot (ElementCompositionPreview.SetElementChildVisual),
// so everything CSS draws into it shares one container: the sprites of an
// element's effects go into the slot of its parent, the sprites of its shadows
// into its own.

interface Slot {
  container: CompositionContainerVisual;
}

const slots = new Map<string, Slot>();
const SLOT_COMMENT = "winui-svelte effects ";

/**
 * The child-visual slot of `owner`, shared by every sprite that wants it; null
 * when someone else's visual holds it. A new object stands for the same parent
 * each time, so a slot is told by the comment its owner's visual carries.
 */
export function childSlotOf(owner: UIElement) {
  const ownerVisual = ElementCompositionPreview.getElementVisual(owner);
  const known = slots.get(ownerVisual.comment);
  const hasKnown = known !== undefined;
  if (hasKnown) {
    return known;
  }

  const foreign: unknown = ElementCompositionPreview.getElementChildVisual(owner);
  const isForeign = foreign !== null && foreign !== undefined;
  if (isForeign) {
    return null;
  }

  const container = ownerVisual.compositor.createContainerVisual();
  ElementCompositionPreview.setElementChildVisual(owner, container);
  const comment = `${SLOT_COMMENT}${slots.size}`;
  ownerVisual.comment = comment;
  const slot = { container };
  slots.set(comment, slot);
  return slot;
}
