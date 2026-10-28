import type { ContentDialogResult, FrameworkElement } from "#src/components/generated/bindings.js";

// The props of the components that open from state (generated:
// scripts/codegen/tables.ts, overlayHosted), beside their control's own.

/** What every flyout takes besides its control's properties. */
export interface FlyoutOverlayProps {
  /**
   * Whether the flyout is open (`bind:open`). Setting it opens or closes the
   * flyout; the user closing it (light dismiss, Escape, a choice) sets it
   * back to false. A flyout asked to open before its target is on screen
   * opens once the target loads.
   */
  open?: boolean | undefined;
  /**
   * The element the flyout opens next to. Defaults to the element the
   * flyout is written in: the button whose `flyout` it fills, or the panel
   * it is a child of.
   */
  target?: FrameworkElement | undefined;
}

/** What a ContentDialog takes besides its control's properties. */
export interface DialogOverlayProps extends FlyoutOverlayProps {
  /**
   * Called with the button the user chose when the dialog closes, and with
   * `None` when the close button, Escape or `open = false` closed it.
   */
  onResult?: ((result: ContentDialogResult) => void) | undefined;
}

/** Every prop a flyout component takes: its control's properties (with their element props), `open` and `target`. */
export type FlyoutOverlayComponentProps<ControlProps> = ControlProps & FlyoutOverlayProps;

/** Every prop a ContentDialog component takes: the control's, `open`, `target` and `onResult`. */
export type DialogOverlayComponentProps<ControlProps> = ControlProps & DialogOverlayProps;
