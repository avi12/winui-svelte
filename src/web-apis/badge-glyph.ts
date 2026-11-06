/** The status glyphs Windows can draw on the app's taskbar button; WinUI-only. */
export const BadgeGlyph = {
  NONE: "none",
  ACTIVITY: "activity",
  ALARM: "alarm",
  ALERT: "alert",
  ATTENTION: "attention",
  AVAILABLE: "available",
  AWAY: "away",
  BUSY: "busy",
  ERROR: "error",
  NEW_MESSAGE: "newMessage",
  PAUSED: "paused",
  PLAYING: "playing",
  UNAVAILABLE: "unavailable"
} as const;
/** One of the values of `BadgeGlyph`. */
export type BadgeGlyph = (typeof BadgeGlyph)[keyof typeof BadgeGlyph];
