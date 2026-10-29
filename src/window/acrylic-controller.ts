import type { Window } from "#src/winui.js";
import {
  DesktopAcrylicController,
  DesktopAcrylicKind,
  ICompositionSupportsSystemBackdrop,
  SystemBackdropConfiguration,
  SystemBackdropTheme,
  WindowActivationState
} from "#src/winui.js";

// The base and thin variants of acrylic are not a class of XAML's backdrops:
// DesktopAcrylicBackdrop has no kind. They are the material of
// DesktopAcrylicController, which a window takes as a target (the window
// itself is an ICompositionSupportsSystemBackdrop) once the window has no
// XAML backdrop, and which needs to be told whether the window has input.

/** The variants of acrylic only the controller makes. */
export const AcrylicVariant = {
  base: DesktopAcrylicKind.Base,
  thin: DesktopAcrylicKind.Thin
} as const;

/** One of `AcrylicVariant`'s values. */
export type AcrylicVariant = (typeof AcrylicVariant)[keyof typeof AcrylicVariant];

/**
 * Puts the base or thin acrylic behind a window's content.
 *
 * @returns What takes the material away and lets the controller go.
 */
export function attachAcrylic({ window, variant }: {
  window: Window;
  variant: AcrylicVariant;
}) {
  const controller = new DesktopAcrylicController();
  controller.kind = variant;
  const configuration = new SystemBackdropConfiguration();
  configuration.isInputActive = true;
  configuration.theme = SystemBackdropTheme.Default;
  const target = window.as(ICompositionSupportsSystemBackdrop);
  const isAdded = controller.addSystemBackdropTarget(target);
  if (!isAdded) {
    controller.close();
    throw new Error("the system could not put acrylic behind the window");
  }

  controller.setSystemBackdropConfiguration(configuration);
  const unsubscribe = window.onActivated((_sender, event) => {
    configuration.isInputActive = event.windowActivationState !== WindowActivationState.Deactivated;
  });
  return () => {
    unsubscribe();
    controller.removeSystemBackdropTarget(target);
    controller.close();
  };
}
