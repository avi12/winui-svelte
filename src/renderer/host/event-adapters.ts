import type { NativeValue } from "#src/native-value.js";
import type { UIElement } from "#src/winui.js";

/** How a web event name (`ondrop`) is wired to a control in place of a WinUI event of that name. */
export interface EventAdapter {
  /**
   * Subscribes the handler written on the element to the control.
   *
   * @returns What ends the subscription.
   */
  subscribe(options: {
    control: UIElement;
    handler: NativeValue;
  }): () => void;
}

/**
 * The adapters by the lower-case web event name. Empty until a module that
 * knows the events (`winui-svelte/data-transfer`) adds its own, so an app that
 * does not use them bundles none of that code.
 */
export const eventAdapters = new Map<string, EventAdapter>();
