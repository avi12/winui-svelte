// The WinRT types the winui-svelte/ocr modules use, from the bindings the app
// generated (`pnpm bindings`), reached through `#winui/*`. The one import site
// of the bindings for the ocr modules; they read nothing else.

export { Language } from "#winui/windows/globalization/Language";
export { BitmapAlphaMode } from "#winui/windows/graphics/imaging/BitmapAlphaMode";
export { BitmapDecoder } from "#winui/windows/graphics/imaging/BitmapDecoder";
export { BitmapPixelFormat } from "#winui/windows/graphics/imaging/BitmapPixelFormat";
export { BitmapTransform } from "#winui/windows/graphics/imaging/BitmapTransform";
export { ColorManagementMode } from "#winui/windows/graphics/imaging/ColorManagementMode";
export { ExifOrientationMode } from "#winui/windows/graphics/imaging/ExifOrientationMode";
export { SoftwareBitmap } from "#winui/windows/graphics/imaging/SoftwareBitmap";
export { OcrEngine } from "#winui/windows/media/ocr/OcrEngine";
