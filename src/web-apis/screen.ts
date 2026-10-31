import { DomErrorName, domException } from "./dom-exception.ts";
import { HandlerEventTarget } from "./event-handlers.ts";
import { defineProperty } from "./install.ts";
import { PermissionStateName, registerPermission } from "./permissions.ts";
import { listenToSource } from "./source-events.ts";
import type { Delivery } from "#src/devices/delivery.js";
import type { DisplayAreaInfo, DisplayMonitorInfo, DisplaySource } from "#src/devices/display.js";
import { getDisplayMonitors, windowsDisplaySource } from "#src/devices/display.js";
import { bind, numberOf } from "#src/win32-calls.js";

const BASE_DPI = 96;
const COLOR_DEPTH = 24;
const PERMISSION_NAME = "window-management";

/** The `type` of a `ScreenOrientation`. */
export const OrientationType = {
  LANDSCAPE_PRIMARY: "landscape-primary",
  PORTRAIT_PRIMARY: "portrait-primary"
} as const;
/** One of the values of `OrientationType`. */
export type OrientationType = (typeof OrientationType)[keyof typeof OrientationType];

/** Stands between `screen` and Windows; the tests give their own. */
export interface ScreenBackend {
  /** The display areas in physical pixels, and the events that change them. */
  readonly source: DisplaySource;

  /** Device pixels per CSS pixel. */
  scale(): number;

  /** What the monitors' EDID says, for the `monitors` extra. */
  monitors(): Promise<readonly DisplayMonitorInfo[]>;
}

function systemScale() {
  const systemDpi = bind({
    dll: "user32.dll",
    entryPoint: "GetDpiForSystem",
    parameters: [],
    returnType: "u32"
  });
  return numberOf(systemDpi.invoke([]).returnValue) / BASE_DPI;
}

/**
 * The backend over `DisplayArea`, the system DPI and `DisplayMonitor`. The
 * display areas need the Windows App SDK to be running, which a window does.
 *
 * @returns A backend for `installScreen`.
 */
export function windowsScreenBackend() {
  return {
    source: windowsDisplaySource(),
    scale: systemScale,
    monitors: () => getDisplayMonitors()
  } satisfies ScreenBackend;
}

interface ScreenGeometry {
  readonly scale: number;
  readonly areas: readonly DisplayAreaInfo[];
}

function pixels({ value, scale }: {
  value: number;
  scale: number;
}) {
  return Math.round(value / scale);
}

function primaryOf(areas: readonly DisplayAreaInfo[]) {
  return areas.find(area => area.isPrimary) ?? areas[0];
}

function orientationTypeOf(area: DisplayAreaInfo | undefined) {
  const isPortrait = area !== undefined && area.outerBounds.height > area.outerBounds.width;
  return isPortrait ? OrientationType.PORTRAIT_PRIMARY : OrientationType.LANDSCAPE_PRIMARY;
}

/** `screen.orientation`: portrait or landscape from the primary display's shape; it cannot be locked. */
export class ScreenOrientation extends HandlerEventTarget {
  private current: OrientationType;

  /** Made by `installScreen`. */
  constructor(type: OrientationType) {
    super();
    this.current = type;
  }

  get type() {
    return this.current;
  }

  get angle() {
    return 0;
  }

  /**
   * Locks the orientation.
   *
   * @returns Never; Windows desktop displays cannot be locked, so it rejects `NotSupportedError`.
   */
  async lock() {
    throw domException({
      name: DomErrorName.NOT_SUPPORTED,
      message: "Orientation lock is not supported on this display"
    });
  }

  unlock() {}

  get onchange() {
    return this.getHandler("change");
  }

  set onchange(handler: EventListener | null) {
    this.setHandler({
      type: "change",
      handler
    });
  }

  /**
   * Takes the shape of the display now and fires `change` when it flipped.
   *
   * @param type - The orientation now.
   */
  update(type: OrientationType) {
    const hasChanged = type !== this.current;
    this.current = type;

    if (hasChanged) {
      this.dispatchEvent(new Event("change"));
    }
  }

  get [Symbol.toStringTag]() {
    return "ScreenOrientation";
  }
}

/** One display: the members of `screen`, and the extra ones of the Window Management API. */
export class Screen extends HandlerEventTarget {
  readonly orientation: ScreenOrientation;
  private readonly geometry: () => ScreenGeometry;

  /** Made by `installScreen`. */
  constructor(geometry: () => ScreenGeometry, orientation: ScreenOrientation) {
    super();
    this.geometry = geometry;
    this.orientation = orientation;
  }

  private get area() {
    return primaryOf(this.geometry().areas);
  }

  get width() {
    return pixels({
      value: this.area?.outerBounds.width ?? 0,
      scale: this.geometry().scale
    });
  }

  get height() {
    return pixels({
      value: this.area?.outerBounds.height ?? 0,
      scale: this.geometry().scale
    });
  }

  get availWidth() {
    return pixels({
      value: this.area?.workArea.width ?? 0,
      scale: this.geometry().scale
    });
  }

  get availHeight() {
    return pixels({
      value: this.area?.workArea.height ?? 0,
      scale: this.geometry().scale
    });
  }

  get colorDepth() {
    return COLOR_DEPTH;
  }

  get pixelDepth() {
    return COLOR_DEPTH;
  }

  /** Whether the desktop spans more than one display. */
  get isExtended() {
    return this.geometry().areas.length > 1;
  }

  get onchange() {
    return this.getHandler("change");
  }

  set onchange(handler: EventListener | null) {
    this.setHandler({
      type: "change",
      handler
    });
  }

  get [Symbol.toStringTag]() {
    return "Screen";
  }
}

/** A display of `getScreenDetails().screens`. */
export class ScreenDetailed {
  readonly width: number;
  readonly height: number;
  readonly availWidth: number;
  readonly availHeight: number;
  readonly availLeft: number;
  readonly availTop: number;
  readonly left: number;
  readonly top: number;
  readonly colorDepth = COLOR_DEPTH;
  readonly pixelDepth = COLOR_DEPTH;
  readonly isPrimary: boolean;
  readonly isInternal = false;
  readonly devicePixelRatio: number;
  readonly label: string;

  /** The area's id in Windows (`DisplayId`). WinUI-only. */
  readonly displayId: string;

  /** Made by `getScreenDetails`. */
  constructor({ area, scale, index }: {
    area: DisplayAreaInfo;
    scale: number;
    index: number;
  }) {
    this.width = pixels({
      value: area.outerBounds.width,
      scale
    });
    this.height = pixels({
      value: area.outerBounds.height,
      scale
    });
    this.availWidth = pixels({
      value: area.workArea.width,
      scale
    });
    this.availHeight = pixels({
      value: area.workArea.height,
      scale
    });
    this.availLeft = pixels({
      value: area.workArea.x,
      scale
    });
    this.availTop = pixels({
      value: area.workArea.y,
      scale
    });
    this.left = pixels({
      value: area.outerBounds.x,
      scale
    });
    this.top = pixels({
      value: area.outerBounds.y,
      scale
    });
    this.isPrimary = area.isPrimary;
    this.devicePixelRatio = scale;
    this.label = `Display ${index + 1}`;
    this.displayId = area.id.toString();
  }

  get [Symbol.toStringTag]() {
    return "ScreenDetailed";
  }
}

/** What `getScreenDetails()` resolves to: every display, and events when they change. */
export class ScreenDetails extends HandlerEventTarget {
  private list: readonly ScreenDetailed[];

  /** What EDID says about each monitor (name, native resolution, physical size, brightness). WinUI-only. */
  readonly monitors: readonly DisplayMonitorInfo[];

  /** Made by `getScreenDetails`. */
  constructor({ screens, monitors }: {
    screens: readonly ScreenDetailed[];
    monitors: readonly DisplayMonitorInfo[];
  }) {
    super();
    this.list = screens;
    this.monitors = monitors;
  }

  get screens() {
    return this.list;
  }

  get currentScreen() {
    return this.list.find(screen => screen.isPrimary) ?? this.list[0];
  }

  get onscreenschange() {
    return this.getHandler("screenschange");
  }

  set onscreenschange(handler: EventListener | null) {
    this.setHandler({
      type: "screenschange",
      handler
    });
  }

  get oncurrentscreenchange() {
    return this.getHandler("currentscreenchange");
  }

  set oncurrentscreenchange(handler: EventListener | null) {
    this.setHandler({
      type: "currentscreenchange",
      handler
    });
  }

  /**
   * Takes the displays now; fires `screenschange` when the set or a geometry changed.
   *
   * @param screens - The displays now.
   */
  update(screens: readonly ScreenDetailed[]) {
    const before = JSON.stringify(this.list);
    const previousCurrent = this.currentScreen?.displayId;
    this.list = screens;

    const isSame = JSON.stringify(screens) === before;
    if (isSame) {
      return;
    }

    this.dispatchEvent(new Event("screenschange"));
    const hasMoved = this.currentScreen?.displayId !== previousCurrent;
    if (hasMoved) {
      this.dispatchEvent(new Event("currentscreenchange"));
    }
  }

  get [Symbol.toStringTag]() {
    return "ScreenDetails";
  }
}

declare global {
  /** The displays of the desktop; defined by `installScreen`. */
  function getScreenDetails(): Promise<ScreenDetails>;

  interface Screen {
    /** Whether the desktop spans more than one display. */
    readonly isExtended: boolean;
  }
}

/** What `installScreen` takes. */
export interface ScreenInstallOptions {
  /** Stands in for Windows; the tests give one. */
  readonly backend?: ScreenBackend;

  /** How a display change reaches the thread the app runs on; the default is the UI thread's dispatcher queue. */
  readonly deliver?: Delivery;
}

/**
 * Defines the `screen` global (width, height, `availWidth`, `colorDepth`,
 * `orientation`), `devicePixelRatio`, `getScreenDetails()` and the classes
 * with them, and answers the Permissions API's `window-management` (always
 * granted). Sizes are in CSS pixels: device pixels over the system scale.
 *
 * @param options - Test stand-ins.
 * @returns The function that takes it away again.
 */
export function installScreen(options: ScreenInstallOptions = {}) {
  const backend = options.backend ?? windowsScreenBackend();
  function geometry() {
    return {
      scale: backend.scale(),
      areas: backend.source.list()
    } satisfies ScreenGeometry;
  }
  const orientation = new ScreenOrientation(orientationTypeOf(primaryOf(geometry().areas)));
  const screen = new Screen(geometry, orientation);
  const open = new Set<WeakRef<ScreenDetails>>();

  function detailsNow() {
    const { areas, scale } = geometry();
    return areas.map((area, index) => new ScreenDetailed({
      area,
      scale,
      index
    }));
  }

  async function getScreenDetails() {
    const monitors = await backend.monitors().catch(() => []);
    const details = new ScreenDetails({
      screens: detailsNow(),
      monitors
    });
    open.add(new WeakRef(details));
    return details;
  }

  const stop = listenToSource({
    subscriptions: backend.source.subscriptions,
    onChange() {
      orientation.update(orientationTypeOf(primaryOf(geometry().areas)));
      screen.dispatchEvent(new Event("change"));
      for (const reference of open) {
        const details = reference.deref();
        if (details) {
          details.update(detailsNow());
        } else {
          open.delete(reference);
        }
      }
    },
    ...options.deliver === undefined ? {} : { deliver: options.deliver }
  });
  const previousRatio = Object.getOwnPropertyDescriptor(globalThis, "devicePixelRatio");
  Object.defineProperty(globalThis, "devicePixelRatio", {
    get: () => backend.scale(),
    configurable: true,
    enumerable: true
  });
  const uninstalls = [
    defineProperty({
      name: "screen",
      value: screen
    }),
    defineProperty({
      name: "getScreenDetails",
      value: getScreenDetails
    }),
    defineProperty({
      name: "Screen",
      value: Screen
    }),
    defineProperty({
      name: "ScreenOrientation",
      value: ScreenOrientation
    }),
    defineProperty({
      name: "ScreenDetails",
      value: ScreenDetails
    }),
    defineProperty({
      name: "ScreenDetailed",
      value: ScreenDetailed
    }),
    registerPermission({
      name: PERMISSION_NAME,
      provider: {
        state: () => PermissionStateName.GRANTED
      }
    })
  ];
  return () => {
    for (const uninstall of uninstalls.reverse()) {
      uninstall();
    }

    const hasPreviousRatio = previousRatio !== undefined;
    if (hasPreviousRatio) {
      Object.defineProperty(globalThis, "devicePixelRatio", previousRatio);
    } else {
      // eslint-disable-next-line no-restricted-syntax -- the one typed way to delete a property of any object
      Reflect.deleteProperty(globalThis, "devicePixelRatio");
    }

    stop();
  };
}
