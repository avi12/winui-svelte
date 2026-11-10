// The Shape Detection API. Each detector has its own file; add the next one
// (FaceDetector) beside text-detector.ts and barcode-detector.ts and export it here.
export type { DOMRectInit } from "./dom-rect-read-only.ts";
export { DOMRectReadOnly } from "./dom-rect-read-only.ts";
export type { DetectedText, DetectedWord, Point2D } from "./detected-text.ts";
export type {
  BarcodeBoundingBox,
  BarcodeDetectorOptions,
  BarcodeFormat,
  DetectedBarcode,
  DetectedBarcodePoint
} from "./barcode-detector.ts";
export { BarcodeDetector, installBarcodeDetector } from "./barcode-detector.ts";
export type { TextDetectorOptions } from "./text-detector.ts";
export { installTextDetector, TextDetector } from "./text-detector.ts";
