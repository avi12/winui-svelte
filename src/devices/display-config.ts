// What the display configuration says of the primary monitor (read in native.ts).

/** What Windows says of a monitor's color: HDR on, or wide color forced on an SDR display. */
export interface AdvancedColor {
  readonly isEnabled: boolean;

  /** Windows widens an SDR display's gamut (automatic color management) instead of showing HDR. */
  readonly isWideColorEnforced: boolean;
}

/** The monitor at the origin of the desktop, as the display configuration names it. */
export interface PrimaryTarget {
  /** The adapter's LUID: the high part in the upper 32 bits. */
  readonly adapterId: bigint;
  readonly targetId: number;
  readonly color: AdvancedColor;
}

/** The reads `readDisplayColor` makes of the display configuration; a test stands in for them. */
export interface DisplayConfigSource {
  /** Null where there is no active display. */
  primaryTarget(): PrimaryTarget | null;
}
