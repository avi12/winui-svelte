import { DisplayArea, DisplayMonitor, DisplayMonitorConnectionKind } from "./bindings.ts";
import type { Delivery } from "./delivery.ts";
import { findAllDevices } from "./find-devices.ts";
import type { Subscription } from "./live.svelte.ts";
import { liveTracker } from "./live.svelte.ts";

/** A rectangle in screen pixels. */
export interface PixelRectangle {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

/** One display area of the desktop (`Microsoft.UI.Windowing.DisplayArea`). */
export interface DisplayAreaInfo {
  readonly id: bigint;
  readonly isPrimary: boolean;

  /** The whole display. */
  readonly outerBounds: PixelRectangle;

  /** The display less the taskbar and other docked bars. */
  readonly workArea: PixelRectangle;
}

/** The reads and events `displays` uses; a test stands in for them. */
export interface DisplaySource {
  list(): readonly DisplayAreaInfo[];
  subscriptions: readonly Subscription[];
}

/**
 * The display source over `DisplayArea`. It needs the Windows App SDK to be
 * running (`initWindowsAppSdk`, which a window does), unlike `getDisplayMonitors`.
 *
 * @returns The display areas now present, and a subscription to the watcher
 *   that reports their coming, going and changing.
 */
export function windowsDisplaySource() {
  return {
    list: () => [...DisplayArea.findAll() ?? []].map(area => ({
      id: area.displayId.value,
      isPrimary: area.isPrimary,
      outerBounds: area.outerBounds,
      workArea: area.workArea
    })),
    subscriptions: [
      notify => {
        const watcher = DisplayArea.createWatcher();
        const unsubscribes = [
          watcher.onAdded(notify),
          watcher.onRemoved(notify),
          watcher.onUpdated(notify)
        ];
        watcher.start();
        return () => {
          for (const unsubscribe of unsubscribes) {
            unsubscribe();
          }

          watcher.stop();
        };
      }
    ]
  } satisfies DisplaySource;
}

/** What `displays` takes. */
export interface DisplaysOptions {
  /** Where the display areas come from; the default is Windows. */
  readonly source?: DisplaySource;

  /** How a change reaches the UI thread; the default runs on its dispatcher queue. */
  readonly deliver?: Delivery;
}

/**
 * The display areas of the desktop, live: their bounds and work areas, which
 * is primary, updating when a display is attached, detached, moved or resized.
 *
 * @param options - Where the areas come from, and how a change is delivered.
 * @returns `areas`, `primary` and `count` as reactive getters.
 */
export function displays(options: DisplaysOptions = {}) {
  const source = options.source ?? windowsDisplaySource();
  const track = liveTracker({
    subscriptions: source.subscriptions,
    ...options.deliver === undefined ? {} : { deliver: options.deliver }
  });
  function read() {
    track();
    return source.list();
  }
  return {
    get areas() {
      return read();
    },
    get primary() {
      return read().find(area => area.isPrimary);
    },
    get count() {
      return read().length;
    }
  };
}

/** A physical monitor (`Windows.Devices.Display.DisplayMonitor`). */
export interface DisplayMonitorInfo {
  readonly id: string;
  readonly name: string;
  readonly connectionKind: DisplayMonitorConnectionKind;
  readonly nativeWidth: number;
  readonly nativeHeight: number;

  /** Null when the monitor does not report its size (a virtual one). */
  readonly physicalWidthInches: number | null;
  readonly physicalHeightInches: number | null;
  readonly rawDpiX: number;
  readonly rawDpiY: number;
  readonly maxLuminanceInNits: number;
}

/**
 * Lists the physical monitors with what their EDID says: name, native
 * resolution, physical size and brightness. Needs no window.
 *
 * @param options - A `signal`.
 * @returns A record per monitor that Windows could open.
 */
export async function getDisplayMonitors({ signal }: { signal?: AbortSignal } = {}) {
  const found = await findAllDevices({
    selector: DisplayMonitor.getDeviceSelector(),
    ...signal === undefined ? {} : { signal }
  });
  const monitors = await Promise.all(found.map(device => DisplayMonitor.fromInterfaceIdAsync(device.id, signal)));
  return monitors.filter(monitor => monitor != null).map(monitor => ({
    id: monitor.deviceId,
    name: monitor.displayName,
    connectionKind: monitor.connectionKind,
    nativeWidth: monitor.nativeResolutionInRawPixels.width,
    nativeHeight: monitor.nativeResolutionInRawPixels.height,
    physicalWidthInches: monitor.physicalSizeInInches?.width ?? null,
    physicalHeightInches: monitor.physicalSizeInInches?.height ?? null,
    rawDpiX: monitor.rawDpiX,
    rawDpiY: monitor.rawDpiY,
    maxLuminanceInNits: monitor.maxLuminanceInNits
  } satisfies DisplayMonitorInfo));
}

export { DisplayMonitorConnectionKind };
