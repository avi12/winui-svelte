import { DisplayMonitor } from "./bindings.ts";
import { deviceChanges } from "./device-changes.ts";
import type { DisplayConfigSource, PrimaryTarget } from "./display-config.ts";
import { openDisplayMonitors, windowsDisplaySource } from "./displays.svelte.ts";
import type { Subscription } from "./live.svelte.ts";
import { windowsDisplayConfig } from "./native.ts";
import { ColorGamut } from "#src/css/media/features.js";

// The area of the sRGB triangle in CIE xy, and how much larger a panel's
// triangle must be to count as Display P3 (1.41 times) or Rec. 2020 (1.97
// times): a point between, so a panel that covers most of the wider gamut
// counts.
const SRGB_AREA = 0.1076;
const P3_AREA_RATIO = 1.25;
const REC2020_AREA_RATIO = 1.75;

/** A chromaticity (CIE xy). */
export interface Chromaticity {
  readonly x: number;
  readonly y: number;
}

/** What a monitor's EDID says of its colors, and which monitor of the display configuration it is. */
export interface MonitorPrimaries {
  readonly adapterId: bigint;
  readonly targetId: number;
  readonly red: Chromaticity;
  readonly green: Chromaticity;
  readonly blue: Chromaticity;
}

/**
 * The gamut a panel's primaries span: its triangle's area against sRGB's.
 *
 * @param primaries - The red, green and blue primaries.
 * @returns The widest of `ColorGamut` the triangle is big enough for.
 */
export function gamutOfPrimaries({ red, green, blue }: Pick<MonitorPrimaries, "red" | "green" | "blue">) {
  const doubleArea = Math.abs(
    red.x * (green.y - blue.y) + green.x * (blue.y - red.y) + blue.x * (red.y - green.y)
  );
  const ratio = doubleArea / 2 / SRGB_AREA;
  const isRec2020 = ratio >= REC2020_AREA_RATIO;
  if (isRec2020) {
    return ColorGamut.rec2020;
  }

  return ratio >= P3_AREA_RATIO ? ColorGamut.p3 : ColorGamut.srgb;
}

function isSameMonitor({ monitor, target }: {
  monitor: MonitorPrimaries;
  target: PrimaryTarget | null;
}) {
  return target !== null && monitor.adapterId === target.adapterId && monitor.targetId === target.targetId;
}

/** The reads `displayColor` makes; a test stands in for them. */
export interface DisplayColorSource {
  config: DisplayConfigSource;

  /** The monitors with their primaries; asynchronous because WinRT opens them so. */
  monitors(): Promise<readonly MonitorPrimaries[]>;

  /** Says when the display configuration or the monitors may have changed. */
  subscriptions: readonly Subscription[];
}

/**
 * The primary monitor's color, as the `dynamic-range`, `video-dynamic-range`
 * and `color-gamut` media features read it. HDR is read live from the display
 * configuration; the gamut comes from the monitor's EDID, which WinRT opens
 * asynchronously, so it is `srgb` until the first read has finished (the
 * listeners are told then).
 *
 * @param source - Where the reads come from.
 * @returns `isHdr`, `gamut` and `subscribe`.
 */
export function displayColor(source: DisplayColorSource) {
  const listeners = new Set<() => void>();
  let monitors: readonly MonitorPrimaries[] | null = null;
  let isLoading = false;
  function notifyAll() {
    for (const listener of listeners) {
      listener();
    }
  }
  function load() {
    if (isLoading) {
      return;
    }

    isLoading = true;
    source.monitors().then(found => {
      monitors = found;
    }, () => {
      monitors = [];
    }).finally(() => {
      isLoading = false;
      notifyAll();
    });
  }
  return {
    isHdr() {
      const target = source.config.primaryTarget();
      return target !== null && target.color.isEnabled && !target.color.isWideColorEnforced;
    },
    gamut() {
      const isUnread = monitors === null;
      if (isUnread) {
        load();
      }

      const target = source.config.primaryTarget();
      const primaries = monitors?.find(monitor => isSameMonitor({
        monitor,
        target
      }));
      return primaries === undefined ? ColorGamut.srgb : gamutOfPrimaries(primaries);
    },
    subscribe(callback: () => void) {
      listeners.add(callback);
      const stops = source.subscriptions.map(subscription => subscription(() => {
        monitors = null;
        callback();
      }));
      return () => {
        listeners.delete(callback);
        for (const stop of stops) {
          stop();
        }
      };
    }
  };
}

const WORD_BITS = 32n;
const HIGH_PART_BITS = 32;

function luidOf({ highPart, lowPart }: {
  highPart: number;
  lowPart: number;
}) {
  return (BigInt.asUintN(HIGH_PART_BITS, BigInt(highPart)) << WORD_BITS) | BigInt(lowPart);
}

/**
 * The display color source over the display configuration (user32) and
 * `DisplayMonitor`. Changes come from the display areas watcher and from a
 * watcher of the monitor devices; whether Windows tells them when HDR is
 * switched on is not verified.
 *
 * @returns Reads of the primary monitor, and the subscriptions that say they changed.
 */
export function windowsDisplayColor() {
  return {
    config: windowsDisplayConfig(),
    async monitors() {
      const opened = await openDisplayMonitors();
      return opened.map(monitor => ({
        adapterId: luidOf(monitor.displayAdapterId),
        targetId: monitor.displayAdapterTargetId,
        red: monitor.redPrimary,
        green: monitor.greenPrimary,
        blue: monitor.bluePrimary
      }));
    },
    subscriptions: [
      ...windowsDisplaySource().subscriptions,
      deviceChanges({ selector: DisplayMonitor.getDeviceSelector() })
    ]
  } satisfies DisplayColorSource;
}
