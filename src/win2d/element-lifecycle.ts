import type { FrameworkElement } from "#winui/microsoft/ui/xaml/FrameworkElement";

// What the controllers that draw on an element's Composition visual have in
// common: they follow its layout, report a failure in a WinUI event, and are
// one per element.

const NEWLINE = "\n";

/** The size of a laid-out element. */
export interface ElementSize {
  width: number;
  height: number;
}

/**
 * Follows one element's layout for a controller: arranges its drawing when
 * the element is laid out or loaded, and lets go of it when it leaves the tree.
 */
export class ElementFollower {
  private readonly element: FrameworkElement;
  private readonly onArrange: (size: ElementSize) => void;
  private readonly onUnload: () => void;
  private stopWatching: (() => void) | null = null;

  constructor({ element, arrange, onUnload }: {
    element: FrameworkElement;
    arrange(size: ElementSize): void;
    onUnload(): void;
  }) {
    this.element = element;
    this.onArrange = arrange;
    this.onUnload = onUnload;
  }

  /** Starts following the element if it is not yet, and arranges now. */
  start() {
    const isWatching = this.stopWatching !== null;
    if (!isWatching) {
      const stops = [
        this.element.onLayoutUpdated(() => this.arrange()),
        this.element.onUnloaded(() => this.onUnload()),
        this.element.onLoaded(() => this.arrange())
      ];
      this.stopWatching = () => {
        for (const stop of stops) {
          stop();
        }
      };
    }

    this.arrange();
  }

  /** Stops following the element. */
  stop() {
    this.stopWatching?.();
    this.stopWatching = null;
  }

  /**
   * Arranges the drawing once the element has a size; a failure here is raised from a WinUI event, which
   * would only say that a callback failed, so it is written out.
   */
  arrange() {
    const { x: width, y: height } = this.element.actualSize;
    const isMeasured = width > 0 && height > 0;
    if (!isMeasured) {
      return;
    }

    try {
      this.onArrange({
        width,
        height
      });
    } catch (error) {
      process.stderr.write(`winui-svelte css: ${error instanceof Error ? error.message : String(error)}${NEWLINE}`);
    }
  }
}

/** The controller of an element in `controllers`, made by `create` the first time. */
export function controllerOf<Element extends WeakKey, Controller>({ controllers, element, create }: {
  controllers: WeakMap<Element, Controller>;
  element: Element;
  create(): Controller;
}) {
  const known = controllers.get(element);
  const hasKnown = known !== undefined;
  if (hasKnown) {
    return known;
  }

  const controller = create();
  controllers.set(element, controller);
  return controller;
}
