import { ConnectedAnimationService } from "#winui/microsoft/ui/xaml/media/animation/ConnectedAnimationService";
import type { UIElement } from "#winui/microsoft/ui/xaml/UIElement";

/** What `connectElement` and `startConnected` need of WinUI's service; the current view's is the default. */
export interface ConnectedAnimationHost {
  prepareToAnimate(key: string, source: UIElement): unknown;
  getAnimation(key: string): { tryStart(destination: UIElement): boolean } | null;
}

/**
 * Remembers an element as the start of a connected animation, to be finished
 * by `startConnected` with the same key on the next page. Call it just before
 * navigating away: WinUI keeps the element's picture for a few seconds.
 *
 * @example
 * connectElement({ key: "photo", element: thumbnail });
 */
export function connectElement({ key, element, host = ConnectedAnimationService.getForCurrentView() }: {
  key: string;
  element: UIElement;
  host?: ConnectedAnimationHost;
}) {
  host.prepareToAnimate(key, element);
}

/**
 * Plays the connected animation `connectElement` prepared under the key,
 * from where the first element was to this one. Call it once the new page's
 * element has its size.
 *
 * @returns True when the animation started, false when none is prepared under
 * the key (it timed out, or was played already).
 */
export function startConnected({ key, element, host = ConnectedAnimationService.getForCurrentView() }: {
  key: string;
  element: UIElement;
  host?: ConnectedAnimationHost;
}) {
  const animation = host.getAnimation(key);
  const isPrepared = animation != null;
  if (!isPrepared) {
    return false;
  }

  return animation.tryStart(element);
}
