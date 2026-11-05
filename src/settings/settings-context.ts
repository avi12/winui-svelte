import { getContext, setContext } from "svelte";

const EXPANDER_KEY = "winui-svelte:settings-expander";

/** Tells the `SettingsCard`s below that they sit in an expander and draw flat; call it while a component is made. */
export function provideExpander() {
  setContext(EXPANDER_KEY, true);
}

/** Where the component being made sits: `isInside` says whether that is in a `SettingsExpander`. */
export function placementOf() {
  return { isInside: getContext(EXPANDER_KEY) === true };
}
