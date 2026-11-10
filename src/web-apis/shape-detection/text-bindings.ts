// The WinRT types the TextDetector uses, from the bindings the app generated
// (`pnpm bindings`), reached through `#winui/*`. The one import site of the
// bindings for the text detector; it reads nothing else.

export { Language } from "#winui/windows/globalization/Language";
export { BitmapAlphaMode } from "#winui/windows/graphics/imaging/BitmapAlphaMode";
export { BitmapPixelFormat } from "#winui/windows/graphics/imaging/BitmapPixelFormat";
export { SoftwareBitmap } from "#winui/windows/graphics/imaging/SoftwareBitmap";
export { OcrEngine } from "#winui/windows/media/ocr/OcrEngine";
