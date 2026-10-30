import { createClickDetector } from "./click-detector.ts";
import type { TrayPointerEvent } from "./click-detector.ts";
import { BalloonIcon, NotifyOperation } from "./native.ts";
import type { Balloon, ScreenRect, TrayIdentity, TrayNative } from "./native.ts";
import { z } from "zod";

const GUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/iu;
const guidSchema = z.string().regex(GUID_PATTERN, "a tray icon GUID looks like 12345678-1234-1234-1234-123456789abc");

const POLL_MILLISECONDS = 30;
const MAINTENANCE_TICKS = 33;
const DOUBLE_CLICK_MILLISECONDS = 500;
const NO_ICON = 0n;
const FIRST_ID = 1;

/** The picture of a tray icon: one .ico path, or one for each taskbar theme. */
export type TrayIconImage = string | {
  /** Shown while the taskbar is light (so a dark glyph). */
  readonly forLightTaskbar: string;

  /** Shown while the taskbar is dark (so a light glyph). */
  readonly forDarkTaskbar: string;
};

/** Starts a repeating timer; returns what stops it. */
export type TrayScheduler = (options: {
  milliseconds: number;
  onTick: () => void;
}) => () => void;

/** The icon beside a balloon's title. */
export const TrayBalloonIcon = {
  NONE: "none",
  INFO: "info",
  WARNING: "warning",
  ERROR: "error"
} as const;

/** One of `TrayBalloonIcon`'s values. */
export type TrayBalloonIcon = (typeof TrayBalloonIcon)[keyof typeof TrayBalloonIcon];

/** The text of a balloon `notify` shows. */
export interface BalloonOptions {
  readonly title: string;
  readonly body?: string;
  readonly icon?: TrayBalloonIcon;
  readonly isSilent?: boolean;
}

/** What can change on a live tray icon. */
export interface TrayIconChanges {
  readonly icon?: TrayIconImage | undefined;
  readonly tooltip?: string | undefined;
  readonly isVisible?: boolean | undefined;
}

/** What `createTrayIcon` takes. */
export interface TrayIconOptions extends TrayIconChanges {
  readonly icon: TrayIconImage;

  /**
   * Keeps the icon in the same place in the tray across runs, so the user's
   * "always show" choice sticks: a GUID that is yours alone and never changes.
   * The shell also ties it to the program's path, so a moved or unsigned
   * build can lose it.
   */
  readonly guid?: string | undefined;

  /** Told of a left click. */
  readonly onclick?: ((event: TrayPointerEvent) => void) | undefined;

  /** Told of a double click (after the second click's own `onclick`). */
  readonly ondoubleclick?: ((event: TrayPointerEvent) => void) | undefined;

  /** Told of a right click; the coordinates are where to put a menu. */
  readonly oncontextmenu?: ((event: TrayPointerEvent) => void) | undefined;

  /** Told of a middle click. */
  readonly onmiddleclick?: ((event: TrayPointerEvent) => void) | undefined;
}

/** The live tray icon `createTrayIcon` returns. */
export interface TrayIconHandle {
  /** Changes the picture, the tooltip or whether the icon shows. */
  update(changes: TrayIconChanges): void;

  /** Shows a balloon over the icon. Its click cannot be heard (see the README). */
  notify(balloon: BalloonOptions): void;

  /** Takes the icon out of the tray and frees what it held. Safe to call twice. */
  remove(): void;

  /** The shell has the icon now. */
  readonly isRegistered: boolean;

  /** Where the shell draws the icon, in screen pixels; null when it does not. */
  bounds(): ScreenRect | null;
}

interface CoreOptions extends TrayIconOptions {
  readonly native: TrayNative;
  readonly schedule: TrayScheduler;
  readonly now: () => number;
}

const BALLOON_ICONS = {
  [TrayBalloonIcon.NONE]: BalloonIcon.none,
  [TrayBalloonIcon.INFO]: BalloonIcon.info,
  [TrayBalloonIcon.WARNING]: BalloonIcon.warning,
  [TrayBalloonIcon.ERROR]: BalloonIcon.error
} as const;

let nextId = FIRST_ID;

// The icons alive in this process, so the process can remove them all.
const liveIcons = new Set<() => void>();

/** Removes every tray icon this process made: for process exit, so none is left as a ghost. */
export function removeAllTrayIcons() {
  for (const remove of liveIcons) {
    remove();
  }
}

function pathOf({ image, isLight }: {
  image: TrayIconImage;
  isLight: boolean;
}) {
  const isSingle = typeof image === "string";
  if (isSingle) {
    return image;
  }

  return isLight ? image.forLightTaskbar : image.forDarkTaskbar;
}

/**
 * The tray icon with its Win32 layer and its clock handed in. Use
 * `createTrayIcon` in an app; a test calls this with fakes.
 */
export function createTrayIconWith(options: CoreOptions) {
  const { native } = options;
  const guid = options.guid === undefined ? null : guidSchema.parse(options.guid);
  const identity: TrayIdentity = {
    owner: native.createOwnerWindow(),
    id: nextId++,
    guid
  };
  let image = options.icon;
  let tooltip = options.tooltip ?? "";
  let isVisible = options.isVisible ?? true;
  let isLight = native.isTaskbarLight();
  let iconSize = native.iconSize();
  let icon = NO_ICON;
  let isRegistered = false;
  let isRemoved = false;
  let tick = 0;
  const detector = createClickDetector({
    now: options.now,
    doubleClickMilliseconds: DOUBLE_CLICK_MILLISECONDS,
    onGesture(event) {
      const handlers = {
        click: options.onclick,
        doubleClick: options.ondoubleclick,
        contextMenu: options.oncontextmenu,
        middleClick: options.onmiddleclick
      };
      handlers[event.gesture]?.(event);
    }
  });

  function loadCurrent() {
    return native.loadIcon({
      path: pathOf({
        image,
        isLight
      }),
      size: iconSize
    });
  }

  function send({ operation, balloon = null }: {
    operation: NotifyOperation;
    balloon?: Balloon | null;
  }) {
    return native.notify({
      operation,
      data: {
        identity,
        icon,
        tooltip,
        balloon
      }
    });
  }

  function add() {
    icon = loadCurrent();
    isRegistered = send({ operation: NotifyOperation.add });

    if (isRegistered) {
      send({ operation: NotifyOperation.setVersion });
    }
  }

  function take() {
    send({ operation: NotifyOperation.remove });
    isRegistered = false;
  }

  function swapIcon() {
    const previous = icon;
    icon = loadCurrent();
    send({ operation: NotifyOperation.modify });

    const isReplacing = previous !== NO_ICON;
    if (isReplacing) {
      native.destroyIcon(previous);
    }
  }

  function maintain() {
    const isNextLight = native.isTaskbarLight();
    const nextSize = native.iconSize();
    const isThemed = typeof image !== "string" && isNextLight !== isLight;
    const isResized = nextSize !== iconSize;
    isLight = isNextLight;
    iconSize = nextSize;

    if (!isVisible) {
      return;
    }

    const isGone = isRegistered && native.iconRect(identity) === null && !send({
      operation: NotifyOperation.modify
    });
    if (isGone) {
      isRegistered = false;
    }

    if (!isRegistered) {
      add();
      return;
    }

    const isStale = isThemed || isResized;
    if (isStale) {
      swapIcon();
    }
  }

  function poll() {
    tick++;
    const isMaintenanceTick = tick % MAINTENANCE_TICKS === 0;
    if (isMaintenanceTick) {
      maintain();
    }

    const sample = native.readPointer();
    const isLookingForIcon = isRegistered && sample.isOnTray;
    detector.feed({
      sample,
      rect: isLookingForIcon ? native.iconRect(identity) : null
    });
  }

  function remove() {
    if (isRemoved) {
      return;
    }

    isRemoved = true;
    stop();
    liveIcons.delete(remove);

    if (isRegistered) {
      take();
    }

    const hasIcon = icon !== NO_ICON;
    if (hasIcon) {
      native.destroyIcon(icon);
    }

    native.destroyWindow(identity.owner);
  }

  if (isVisible) {
    add();
  }

  const stop = options.schedule({
    milliseconds: POLL_MILLISECONDS,
    onTick: poll
  });
  liveIcons.add(remove);
  const handle: TrayIconHandle = {
    update(changes) {
      if (isRemoved) {
        return;
      }

      const isImageChanged = changes.icon !== undefined && changes.icon !== image;
      const isTooltipChanged = changes.tooltip !== undefined && changes.tooltip !== tooltip;
      const isVisibilityChanged = changes.isVisible !== undefined && changes.isVisible !== isVisible;
      image = changes.icon ?? image;
      tooltip = changes.tooltip ?? tooltip;
      isVisible = changes.isVisible ?? isVisible;

      if (isVisibilityChanged) {
        if (isVisible) {
          add();
        } else {
          take();
        }

        return;
      }

      if (!isRegistered) {
        return;
      }

      if (isImageChanged) {
        swapIcon();
      } else if (isTooltipChanged) {
        send({ operation: NotifyOperation.modify });
      }
    },
    notify(balloon) {
      if (!isRegistered) {
        return;
      }

      send({
        operation: NotifyOperation.modify,
        balloon: {
          title: balloon.title,
          body: balloon.body ?? "",
          icon: BALLOON_ICONS[balloon.icon ?? TrayBalloonIcon.INFO],
          isSilent: balloon.isSilent ?? false
        }
      });
    },
    remove,
    get isRegistered() {
      return isRegistered;
    },
    bounds() {
      return isRegistered ? native.iconRect(identity) : null;
    }
  };
  return handle;
}
