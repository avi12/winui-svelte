import { DynWin32 } from "@microsoft/dynwinrt/win32/unsafe";
import { bind, numberOf } from "#src/win32-calls.js";

const SM_CXDOUBLECLK = 36;

const getDoubleClickTime = bind({
  dll: "user32.dll",
  entryPoint: "GetDoubleClickTime",
  parameters: [],
  returnType: "u32"
});

const getSystemMetrics = bind({
  dll: "user32.dll",
  entryPoint: "GetSystemMetrics",
  parameters: ["i32"],
  returnType: "i32"
});

/**
 * Windows' double-click settings: the longest time between two presses
 * (`GetDoubleClickTime`, from the Mouse settings) and how far apart they may
 * be (`SM_CXDOUBLECLK`), in physical pixels.
 */
export function doubleClickSettings() {
  return {
    milliseconds: numberOf(getDoubleClickTime.invoke([]).returnValue),
    distance: numberOf(getSystemMetrics.invoke([DynWin32.i32(SM_CXDOUBLECLK)]).returnValue)
  };
}
