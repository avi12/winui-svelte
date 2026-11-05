import type { AutomationLiveSettingName } from "#src/components/generated/enums.js";

/**
 * How urgently a screen reader speaks a change, as ARIA's `aria-live`: `OFF`
 * says nothing, `POLITE` waits for the user to be idle (`role="status"`),
 * `ASSERTIVE` interrupts (`role="alert"`).
 */
export const LivePriority = {
  OFF: "off",
  POLITE: "polite",
  ASSERTIVE: "assertive"
} as const;
/** One of the values of `LivePriority`. */
export type LivePriority = (typeof LivePriority)[keyof typeof LivePriority];

const liveSettingNames = {
  [LivePriority.OFF]: "Off",
  [LivePriority.POLITE]: "Polite",
  [LivePriority.ASSERTIVE]: "Assertive"
} as const satisfies Record<LivePriority, AutomationLiveSettingName>;

/**
 * The name of WinUI's `AutomationLiveSetting` a priority stands for: the one
 * place the mapping lives, for the `automationLiveSetting` prop and for
 * `liveRegion`.
 *
 * @param priority - The priority.
 * @returns The `AutomationLiveSetting` member name.
 */
export function liveSettingNameOf(priority: LivePriority) {
  return liveSettingNames[priority];
}
