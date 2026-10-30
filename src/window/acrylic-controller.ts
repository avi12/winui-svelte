import type { Window } from "#src/winui.js";
import {
  DesktopAcrylicController,
  DesktopAcrylicKind,
  ElementTheme,
  FrameworkElement,
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

function followElementTheme({ element, configuration }: {
  element: FrameworkElement;
  configuration: SystemBackdropConfiguration;
}) {
  function apply() {
    const isDark = element.actualTheme === ElementTheme.Dark;
    configuration.theme = isDark ? SystemBackdropTheme.Dark : SystemBackdropTheme.Light;
  }
  apply();
  return element.onActualThemeChanged(apply);
}

// The controller does not read the window's theme: it is told, and told again
// when the content's actual theme changes (the system's, or a requested one).
function followTheme({ window, configuration }: {
  window: Window;
  configuration: SystemBackdropConfiguration;
}) {
  const { content } = window;
  const isThemed = content instanceof FrameworkElement;
  if (isThemed) {
    return followElementTheme({
      element: content,
      configuration
    });
  }

  return () => {};
}

/**
 * Puts the base or thin acrylic behind a window's content, light or dark as
 * the content is.
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
  const stopFollowing = followTheme({
    window,
    configuration
  });
  const unsubscribe = window.onActivated((_sender, event) => {
    configuration.isInputActive = event.windowActivationState !== WindowActivationState.Deactivated;
  });
  return () => {
    stopFollowing();
    unsubscribe();
    controller.removeSystemBackdropTarget(target);
    controller.close();
  };
}
