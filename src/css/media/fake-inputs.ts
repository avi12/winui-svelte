import type { MediaInputs } from "./features.ts";
import { ColorGamut, MediaPresentation } from "./features.ts";

const WIDTH = 800;
const HEIGHT = 600;
const MONITOR_WIDTH = 1920;
const MONITOR_HEIGHT = 1080;
const SCALE = 1.5;

/**
 * Answers for tests: an 800 by 600 window on a 1920 by 1080 monitor at 150%, light
 * theme, animations and transparency on, a mouse, sRGB, no metered connection.
 */
export function fakeInputs(overrides: Partial<MediaInputs> = {}) {
  return {
    viewport: () => ({
      width: WIDTH,
      height: HEIGHT
    }),
    display: () => ({
      width: MONITOR_WIDTH,
      height: MONITOR_HEIGHT
    }),
    scale: () => SCALE,
    isDark: () => false,
    isHighContrast: () => false,
    isAnimationEnabled: () => true,
    isTransparencyEnabled: () => true,
    presentation: () => MediaPresentation.windowed,
    devices: () => ({
      hasMouse: true,
      hasTouch: false,
      hasPen: false
    }),
    isHdr: () => false,
    gamut: () => ColorGamut.srgb,
    isMetered: () => false,
    ...overrides
  } satisfies MediaInputs;
}
