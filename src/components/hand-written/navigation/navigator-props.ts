// The Navigator component's props. Kept out of Navigator.d.svelte.ts so the
// component can import them: the Svelte language server reads
// `./Navigator.d.svelte.ts` imported from Navigator.svelte as Navigator.svelte
// itself.
import type { NavigatedEvent, NavigatorHandle, NavigatorHostProps } from "./navigator-host.svelte.ts";
import type { ContentControlComponentProps } from "#src/components/generated/controls/ContentControl.svelte.js";
import type { Snippet } from "svelte";

// What the component owns: the page is the control's content, and its
// transitions are the navigation's.
type OwnedByNavigator = "children" | "content" | "contentTransitions" | "contentTemplate" | "contentTemplateSelector";

/** The props of the `Navigator` component: its control's, the navigation's own, and a handle. */
export interface NavigatorComponentProps
  extends Omit<ContentControlComponentProps, OwnedByNavigator>, NavigatorHostProps {
  // The navigator, for code that navigates and reads the history
  // (`bind:handle`).
  handle?: NavigatorHandle | undefined;
  // The navigation transition info a page plays when it replaces another: one
  // of the `...NavigationTransitionInfo` components, for example
  // `<DrillInNavigationTransitionInfo />`. Without it, WinUI's own entrance.
  transition?: Snippet;
  // Called once the control is in place, with the handle: where the first page
  // is navigated to.
  onReady?: ((handle: NavigatorHandle) => void) | undefined;
  onNavigated?: ((event: NavigatedEvent) => void) | undefined;
}
