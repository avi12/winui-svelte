import { BadgeGlyph } from "./badge-glyph.ts";
import { DomErrorName, domException } from "./dom-exception.ts";
import { defineNavigatorProperty } from "./install.ts";
import { BadgeNotificationGlyph } from "#winui/microsoft/windows/badge-notifications/BadgeNotificationGlyph";
import { BadgeNotificationManager } from "#winui/microsoft/windows/badge-notifications/BadgeNotificationManager";

export { BadgeGlyph } from "./badge-glyph.ts";

const glyphValues = {
  [BadgeGlyph.NONE]: BadgeNotificationGlyph.None,
  [BadgeGlyph.ACTIVITY]: BadgeNotificationGlyph.Activity,
  [BadgeGlyph.ALARM]: BadgeNotificationGlyph.Alarm,
  [BadgeGlyph.ALERT]: BadgeNotificationGlyph.Alert,
  [BadgeGlyph.ATTENTION]: BadgeNotificationGlyph.Attention,
  [BadgeGlyph.AVAILABLE]: BadgeNotificationGlyph.Available,
  [BadgeGlyph.AWAY]: BadgeNotificationGlyph.Away,
  [BadgeGlyph.BUSY]: BadgeNotificationGlyph.Busy,
  [BadgeGlyph.ERROR]: BadgeNotificationGlyph.Error,
  [BadgeGlyph.NEW_MESSAGE]: BadgeNotificationGlyph.NewMessage,
  [BadgeGlyph.PAUSED]: BadgeNotificationGlyph.Paused,
  [BadgeGlyph.PLAYING]: BadgeNotificationGlyph.Playing,
  [BadgeGlyph.UNAVAILABLE]: BadgeNotificationGlyph.Unavailable
} as const;

const FLAG_GLYPH = BadgeGlyph.ATTENTION;

/** What draws the badge; a test stands in for Windows. */
export interface BadgeBackend {
  setCount(count: number): void;
  setGlyph(glyph: BadgeGlyph): void;
  clear(): void;
}

/** What `installBadging` takes. */
export interface BadgingInstallOptions {
  /** Draws the badge; the default is `BadgeNotificationManager`. */
  readonly backend?: BadgeBackend;

  /**
   * Draws the badge when `backend` throws, as Windows does for a process
   * with no package identity. `taskbarBadgeBackend` of
   * `winui-svelte/window/taskbar` draws it on a window's taskbar button.
   */
  readonly fallback?: BadgeBackend;
}

/** The members `navigator` gains beyond the standard two; WinUI-only. */
export interface BadgingExtras {
  /** Shows one of Windows' status glyphs instead of a number. */
  setAppBadgeGlyph(glyph: BadgeGlyph): Promise<void>;
}

declare global {
  // The extra joins the standard Navigator wherever this module is imported.
  // eslint-disable-next-line @typescript-eslint/no-empty-object-type -- declaration merging is the point
  interface Navigator extends BadgingExtras {}
}

function windowsBadgeBackend() {
  return {
    setCount: (count: number) => BadgeNotificationManager.current.setBadgeAsCount(count),
    setGlyph: (glyph: BadgeGlyph) => BadgeNotificationManager.current.setBadgeAsGlyph(glyphValues[glyph]),
    clear: () => BadgeNotificationManager.current.clearBadge()
  } satisfies BadgeBackend;
}

function withFallback({ primary, fallback }: {
  primary: BadgeBackend;
  fallback: BadgeBackend | undefined;
}) {
  if (!fallback) {
    return primary;
  }

  const spare = fallback;
  function attempt(act: (backend: BadgeBackend) => void) {
    try {
      act(primary);
    } catch {
      act(spare);
    }
  }

  return {
    setCount: count => attempt(backend => backend.setCount(count)),
    setGlyph: glyph => attempt(backend => backend.setGlyph(glyph)),
    clear: () => attempt(backend => backend.clear())
  } satisfies BadgeBackend;
}

function run(action: () => void) {
  try {
    action();
  } catch (error) {
    throw domException({
      name: DomErrorName.NOT_SUPPORTED,
      message: `the badge could not be set: ${error instanceof Error ? error.message : String(error)}`
    });
  }
}

function countOf(contents: number) {
  const isCount = Number.isSafeInteger(contents) && contents >= 0;
  if (!isCount) {
    throw new TypeError("the badge count must be a non-negative integer");
  }

  return contents;
}

/**
 * Defines `navigator.setAppBadge`, `navigator.clearAppBadge` and the extra
 * `navigator.setAppBadgeGlyph` over `BadgeNotificationManager`. A count of
 * zero clears the badge, as in the spec; no argument shows the attention
 * glyph (the spec's "flag"). Windows may refuse the badge to a process with no
 * app identity, which rejects with `NotSupportedError`. No permission is
 * involved. Nothing is defined until this is called.
 *
 * @param options - A stand-in for Windows, for a test.
 * @returns The function that takes them away again.
 */
export function installBadging(options: BadgingInstallOptions = {}) {
  const backend = withFallback({
    primary: options.backend ?? windowsBadgeBackend(),
    fallback: options.fallback
  });
  async function setAppBadge(contents?: number) {
    const isFlag = contents === undefined;
    if (isFlag) {
      run(() => backend.setGlyph(FLAG_GLYPH));
      return;
    }

    const count = countOf(contents);
    const isZero = count === 0;
    run(() => (isZero ? backend.clear() : backend.setCount(count)));
  }

  async function setAppBadgeGlyph(glyph: BadgeGlyph) {
    const isKnown = Object.hasOwn(glyphValues, glyph);
    if (!isKnown) {
      throw new TypeError(`'${String(glyph)}' is not a badge glyph`);
    }

    run(() => backend.setGlyph(glyph));
  }

  const uninstallers = [
    defineNavigatorProperty({
      name: "setAppBadge",
      value: setAppBadge
    }),
    defineNavigatorProperty({
      name: "clearAppBadge",
      value: async () => run(() => backend.clear())
    }),
    defineNavigatorProperty({
      name: "setAppBadgeGlyph",
      value: setAppBadgeGlyph
    })
  ];
  return () => {
    for (const uninstall of uninstallers.reverse()) {
      uninstall();
    }
  };
}
