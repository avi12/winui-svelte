import type { FrameworkElement, Window } from "#src/winui.js";
import {
  DesktopAcrylicController,
  DesktopAcrylicKind,
  ICompositionSupportsSystemBackdrop,
  ElementTheme,
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

// The controller does not read the content's theme: it is told it, and told
// again when the content's actual theme changes.
const BACKDROP_THEMES = new Map<ElementTheme, SystemBackdropTheme>([
  [ElementTheme.Light, SystemBackdropTheme.Light],
  [ElementTheme.Dark, SystemBackdropTheme.Dark]
]);

/**
 * Puts the base or thin acrylic behind a window's content, in the theme of
 * `content`.
 *
 * @returns What takes the material away and lets the controller go.
 */
export function attachAcrylic({ window, content, variant }: {
  window: Window;
  content: FrameworkElement;
  variant: AcrylicVariant;
}) {
  const controller = new DesktopAcrylicController();
  controller.kind = variant;
  const configuration = new SystemBackdropConfiguration();
  configuration.isInputActive = true;
  const followTheme = () => {
    configuration.theme = BACKDROP_THEMES.get(content.actualTheme) ?? SystemBackdropTheme.Default;
  };
  followTheme();
  const unsubscribeTheme = content.onActualThemeChanged(followTheme);
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
    unsubscribeTheme();
    controller.removeSystemBackdropTarget(target);
    controller.close();
  };
}
