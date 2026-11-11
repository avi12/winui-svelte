import { createClickDetector, TrayGesture } from "./click-detector.ts";
import type { TrayPointerEvent } from "./click-detector.ts";
import { NotifyOperation, TrayNotification } from "./native.ts";
import type {
  Balloon,
  PointerSample,
  ScreenRect,
  TrayIdentity,
  TrayMessage,
  TrayNative
} from "./native.ts";
import type {
  ThemedIconExtra,
  TrayChanges,
  TrayContext,
  TrayExtra,
  TrayHandle
} from "./tray-extras.ts";
import type { ImageOf } from "./tray-extras.ts";
import type { PictureSource, TaskbarPictures } from "#src/picture-source.js";
import { z } from "zod";

const GUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/iu;
const guidSchema = z.string().regex(GUID_PATTERN, "a tray icon GUID looks like 12345678-1234-1234-1234-123456789abc");

// The pointer is read fast while it is over the taskbar, where an icon can be
// clicked, and slowly elsewhere: a click needs the pointer to arrive first, and
// a press that happened between two slow reads is still reported by the next
// (ButtonSample.wasPressed). A timer that wakes the thread 33 times a second
// costs about 2% of a core.
const FAST_POLL_MILLISECONDS = 30;
const SLOW_POLL_MILLISECONDS = 250;
const MAINTENANCE_MILLISECONDS = 1000;
const DOUBLE_CLICK_MILLISECONDS = 500;
const MESSAGE_ECHO_MILLISECONDS = 500;
const GESTURE_OF_NOTIFICATION: ReadonlyMap<number, TrayGesture> = new Map([
  [TrayNotification.select, TrayGesture.click],
  [TrayNotification.keySelect, TrayGesture.doubleClick],
  [TrayNotification.contextMenu, TrayGesture.contextMenu]
]);
const HANDLER_OF_GESTURE = {
  click: "onclick",
  doubleClick: "ondoubleclick",
  contextMenu: "oncontextmenu",
  middleClick: "onmiddleclick"
} as const;
const NO_ICON = 0n;
const FIRST_ID = 1;

/** The picture of a tray icon: one .ico path, or one for each taskbar theme. */
export type TrayIconImage = PictureSource<TaskbarPictures>;

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

interface CoreOptions<Extras extends readonly TrayExtra[]> extends Omit<TrayIconOptions, "icon"> {
  readonly icon: ImageOf<Extras>;
  readonly extras: Extras;
  readonly native: TrayNative;
  readonly schedule: TrayScheduler;
  readonly now: () => number;
}

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

function isThemedIcon(extra: TrayExtra): extra is ThemedIconExtra {
  return extra.kind === "themedIcon";
}

/**
 * The tray icon with its Win32 layer and its clock handed in, and only the extras given: `balloons`
 * adds `notify`, `bounds` adds `bounds`, `themedIcon` lets `icon` follow the taskbar theme. Use
 * `createTrayIcon` in an app (it has all three); a test calls this with fakes.
 */
export function createTrayCore<const Extras extends readonly TrayExtra[]>(options: CoreOptions<Extras>) {
  const { native } = options;
  const readIsLight = options.extras.find(isThemedIcon)?.createReader() ?? (() => false);
  const guid = options.guid === undefined ? null : guidSchema.parse(options.guid);
  const identity: TrayIdentity = {
    owner: native.createOwnerWindow(),
    id: nextId++,
    guid
  };
  let image: TrayIconImage = options.icon;
  let tooltip = options.tooltip ?? "";
  let isVisible = options.isVisible ?? true;
  let isLight = readIsLight();
  let iconSize = native.iconSize();
  let icon = NO_ICON;
  let isRegistered = false;
  let isRemoved = false;
  let tick = 0;
  let pollMilliseconds = SLOW_POLL_MILLISECONDS;
  let lastPolledAt = -MESSAGE_ECHO_MILLISECONDS;
  let pendingMessages: TrayMessage[] = [];
  const detector = createClickDetector({
    now: options.now,
    doubleClickMilliseconds: DOUBLE_CLICK_MILLISECONDS,
    onGesture(event) {
      const isMenu = event.gesture === TrayGesture.contextMenu;
      const isLeftToTheShell = isMenu && native.isReceivingMessages === true;
      if (isLeftToTheShell) {
        return;
      }

      lastPolledAt = options.now();

      if (!isMenu) {
        native.allowForeground();
      }

      options[HANDLER_OF_GESTURE[event.gesture]]?.(event);
      settle();
    }
  });

  // A handler can block (a popup menu is modal), and what the shell sent and the buttons pressed meanwhile
  // belong to the interaction it was handling: the click that opened the menu and the one that dismissed it.
  // Delivered afterwards they open the menu again, so they are read and dropped.
  function settle() {
    native.readMessages(identity.owner);
    native.readPointer();
    pendingMessages = [];
    lastPolledAt = options.now();
  }

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
    const isNextLight = readIsLight();
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

  function pace(sample: PointerSample) {
    const isButtonHeld = sample.left.isDown || sample.right.isDown || sample.middle.isDown;
    const isActive = sample.isOnTray || isButtonHeld;
    const wanted = isActive ? FAST_POLL_MILLISECONDS : SLOW_POLL_MILLISECONDS;
    const isChanged = wanted !== pollMilliseconds;
    if (!isChanged) {
      return;
    }

    pollMilliseconds = wanted;
    stopTimer();
    stopTimer = startTimer();
  }

  function deliverMessages() {
    const messages = pendingMessages;
    pendingMessages = native.readMessages(identity.owner);
    const isEcho = options.now() - lastPolledAt < MESSAGE_ECHO_MILLISECONDS;
    if (isEcho) {
      return;
    }

    for (const { notification, x, y } of messages) {
      const gesture = GESTURE_OF_NOTIFICATION.get(notification);
      const isKnown = gesture !== undefined;
      if (!isKnown) {
        continue;
      }

      native.allowForeground();
      options[HANDLER_OF_GESTURE[gesture]]?.({
        gesture,
        x,
        y
      });
      settle();
      return;
    }
  }

  function poll() {
    tick++;
    const isMaintenanceTick = tick % Math.ceil(MAINTENANCE_MILLISECONDS / pollMilliseconds) === 0;
    if (isMaintenanceTick) {
      maintain();
    }

    const sample = native.readPointer();
    const isLookingForIcon = isRegistered && sample.isOnTray;
    detector.feed({
      sample,
      rect: isLookingForIcon ? native.iconRect(identity) : null
    });
    deliverMessages();
    pace(sample);
  }

  function remove() {
    if (isRemoved) {
      return;
    }

    isRemoved = true;
    stopTimer();
    liveIcons.delete(remove);

    if (isRegistered) {
      take();
    }

    const hasIcon = icon !== NO_ICON;
    if (hasIcon) {
      native.destroyIcon(icon);
    }

    native.destroyWindow(identity.owner);
    native.stopReadingPointer?.();
  }

  if (isVisible) {
    add();
  }

  function noStop() {}

  function startTimer() {
    return options.schedule({
      milliseconds: pollMilliseconds,
      onTick: poll
    });
  }

  let stopTimer = isVisible ? startTimer() : noStop;
  liveIcons.add(remove);
  const context: TrayContext = {
    send,
    isRegistered: () => isRegistered,
    iconRect: () => native.iconRect(identity)
  };
  const base = {
    update(changes: TrayChanges<Extras>) {
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
          stopTimer = startTimer();
        } else {
          take();
          stopTimer();
          stopTimer = noStop;
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
    remove,
    get isRegistered() {
      return isRegistered;
    }
  };
  const added = options.extras.flatMap(extra => "extend" in extra ? [extra.extend(context)] : []);
  // oxlint-disable-next-line typescript/consistent-type-assertions -- Object.assign loses the members the extras add
  return Object.assign(base, ...added) as TrayHandle<Extras>;
}
