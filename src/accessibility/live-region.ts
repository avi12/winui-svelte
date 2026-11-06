import { LivePriority, liveSettingNameOf } from "./live-priority.ts";
import { AutomationLiveSetting, AutomationProperties } from "#src/components/generated/bindings.js";
import type { DependencyObject } from "#src/components/generated/bindings.js";
import { control } from "#src/components/runtime.js";

/** What `liveRegion` takes. */
export interface LiveRegionOptions {
  /** How urgently a change of the element's text is spoken; polite by default. */
  readonly priority?: LivePriority | undefined;
}

/**
 * Makes an element a live region, as `aria-live`: a screen reader speaks the
 * element's text when it changes (`AutomationProperties.LiveSetting`).
 * Used as `@attach liveRegion({ priority: LivePriority.ASSERTIVE })` on a `TextBlock`.
 *
 * @param options - The priority.
 * @returns The attachment to put after `@attach`.
 */
export function liveRegion({ priority = LivePriority.POLITE }: LiveRegionOptions = {}) {
  return control<DependencyObject>(region => {
    AutomationProperties.setLiveSetting(region, AutomationLiveSetting[liveSettingNameOf(priority)]);
    return () => {
      AutomationProperties.setLiveSetting(region, AutomationLiveSetting.Off);
    };
  });
}
