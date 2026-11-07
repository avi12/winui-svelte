import type { SystemBackend } from "./system-backend.ts";
import type { DisplayBounds, DisplayInfoFlags, DisplayUnitInfo } from "./system-types.ts";
import type { PixelRectangle } from "#src/devices/display.js";
import { listenIfAllowed } from "#src/devices/subscription.js";
import type { Unsubscribe } from "#src/devices/subscription.js";
import { ChromeEvent } from "#src/downloads/chrome-event.js";
import { z } from "zod";

const BASE_DPI = 96;

const flagsSchema = z.object({ singleUnified: z.boolean().optional() }).optional();

function boundsOf(rectangle: PixelRectangle) {
  return {
    left: rectangle.x,
    top: rectangle.y,
    width: rectangle.width,
    height: rectangle.height
  } satisfies DisplayBounds;
}

// Listens to the display source only while a listener exists.
class DisplayChangedEvent extends ChromeEvent<() => void> {
  private readonly start: () => Unsubscribe;
  private stop: Unsubscribe | null = null;

  constructor(start: () => Unsubscribe) {
    super();
    this.start = start;
  }

  override addListener(listener: () => void) {
    super.addListener(listener);
    this.stop ??= this.start();
  }

  override removeListener(listener: () => void) {
    super.removeListener(listener);
    const isIdle = !this.hasListeners();
    const isRunning = isIdle && this.stop !== null;
    if (isRunning) {
      this.stop?.();
      this.stop = null;
    }
  }
}

/** `chrome.system.display`, over the display areas `devices/display` reads. */
export class SystemDisplay {
  /** Fires when a display is attached, detached, moved or resized. */
  readonly onDisplayChanged: ChromeEvent<() => void>;
  private readonly backend: SystemBackend;

  /** Made by `createChromeSystem`. */
  constructor(backend: SystemBackend) {
    this.backend = backend;
    this.onDisplayChanged = new DisplayChangedEvent(() => {
      const stops = backend.displays.subscriptions.map(subscription => listenIfAllowed({
        subscription,
        notify: () => this.onDisplayChanged.dispatch()
      }));
      return () => {
        for (const stop of stops) {
          stop();
        }
      };
    });
  }

  /**
   * Describes the displays, the primary one first.
   *
   * @param flags - `singleUnified`, which has no meaning on Windows.
   * @returns A promise of one record per display area, in screen pixels.
   */
  async getInfo(flags?: DisplayInfoFlags) {
    flagsSchema.parse(flags);
    const dpi = this.backend.scale() * BASE_DPI;
    const areas = this.backend.displays.list();
    const ordered = [...areas.filter(area => area.isPrimary), ...areas.filter(area => !area.isPrimary)];
    return ordered.map((area, i) => ({
      id: String(area.id),
      name: `Display ${i + 1}`,
      mirroringSourceId: "",
      isPrimary: area.isPrimary,
      isEnabled: true,
      dpiX: dpi,
      dpiY: dpi,
      rotation: 0,
      bounds: boundsOf(area.outerBounds),
      workArea: boundsOf(area.workArea)
    } satisfies DisplayUnitInfo));
  }
}
