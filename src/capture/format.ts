/** The byte order of the pixels a capture hands over, four bytes a pixel. */
export const CaptureFormat = {
  /** Red, green, blue, alpha: what an `ImageData` and a canvas of the web hold. */
  RGBA: "rgba",
  /** Blue, green, red, alpha: what Windows and Win2D hold, so no channel is swapped. */
  BGRA: "bgra"
} as const;

/** One of the values of `CaptureFormat`. */
export type CaptureFormat = (typeof CaptureFormat)[keyof typeof CaptureFormat];
