/**
 * The class that keeps an element's transitions and animations when the user
 * asked for reduced motion (Windows' animation effects off, or
 * `prefers-reduced-motion: reduce`): CSS transitions and animations, and
 * Svelte's `transition:`, `in:`, `out:` and `animate:`, skip to their end
 * state on any element without it.
 */
export const MOTION_ALWAYS_CLASS = "winui-motion-always";
