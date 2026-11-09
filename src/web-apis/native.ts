import { DynWin32, DynWin32Unsafe } from "@microsoft/dynwinrt/win32/unsafe";
import { addressOf, bind, numberOf, pointerOf } from "#src/win32-calls.js";

const INVALID_COLOR = 0xffffffff;
const BYTE_MASK = 0xff;
const GREEN_SHIFT = 8;
const BLUE_SHIFT = 16;

/**
 * Reads a pixel of the screen with GDI, as it shows now.
 *
 * @returns A function from screen coordinates to the pixel's color, or nothing outside every screen.
 */
export function createScreenPixelReader() {
  const getDeviceContext = bind({
    dll: "user32.dll",
    entryPoint: "GetDC",
    parameters: ["pointer"],
    returnType: "pointer"
  });
  const releaseDeviceContext = bind({
    dll: "user32.dll",
    entryPoint: "ReleaseDC",
    parameters: ["pointer", "pointer"],
    returnType: "i32"
  });
  const getPixel = bind({
    dll: "gdi32.dll",
    entryPoint: "GetPixel",
    parameters: ["pointer", "i32", "i32"],
    returnType: "u32"
  });
  return ({ x, y }: {
    x: number;
    y: number;
  }) => {
    const screen = addressOf(getDeviceContext.invoke([pointerOf(null)]).returnValue);
    try {
      const pixelArguments = [DynWin32Unsafe.pointer(screen), DynWin32.i32(x), DynWin32.i32(y)];
      const color = numberOf(getPixel.invoke(pixelArguments).returnValue);
      const isInvalid = color === INVALID_COLOR;
      if (isInvalid) {
        return undefined;
      }

      return {
        red: color & BYTE_MASK,
        green: (color >> GREEN_SHIFT) & BYTE_MASK,
        blue: (color >> BLUE_SHIFT) & BYTE_MASK
      };
    } finally {
      releaseDeviceContext.invoke([pointerOf(null), DynWin32Unsafe.pointer(screen)]);
    }
  };
}
