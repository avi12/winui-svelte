// The opt-in Win2D part of the package: `winui-svelte/win2d`. Nothing of it is
// loaded by an app that does not import it, and the native library
// (Microsoft.Graphics.Canvas.dll) is only activated by the first Win2D class
// the app uses.

export * from "#src/components/generated/win2d/index.js";
export { default as Canvas } from "./Canvas.svelte";
export type { CanvasFrame, CanvasProps } from "./canvas-props.ts";
export * from "./classes.ts";
export { applyEffect, BACKDROP, createEffectBrush, effectSource, ELEMENT_SOURCE } from "./composition.ts";
export type { Paint, TextOptions } from "./draw.ts";
export {
  clear,
  drawBitmap,
  drawCircle,
  drawEllipse,
  drawGeometry,
  drawImage,
  drawLine,
  drawRectangle,
  drawText,
  fillCircle,
  fillEllipse,
  fillGeometry,
  fillRectangle,
  fillRoundedRectangle,
  isColor,
  setTransform
} from "./draw.ts";
export { IDENTITY, multiply, rotation, scaling, translation } from "./matrix.ts";
export type { Command } from "./painter.ts";
export { drawingPainter, Painter, Recording } from "./painter.ts";
export type { Figure } from "./resources.ts";
export {
  bitmapFromColors,
  circleGeometry,
  createRenderTarget,
  createTextFormat,
  loadBitmap,
  pixelAt,
  polylineGeometry,
  readPixels,
  roundedRectangleGeometry,
  sharedDevice
} from "./resources.ts";
