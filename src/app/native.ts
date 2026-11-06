import { DynWin32 } from "@microsoft/dynwinrt/win32/unsafe";
import {
  bind,
  numberOf,
  pointerOf,
  wideMemory,
  withMemory
} from "#src/win32-calls.js";

/**
 * Registers this process with Windows for a restart after a crash.
 *
 * @returns A function from the command line and the flags to the HRESULT.
 */
export function createRestartRegistrar() {
  const registerApplicationRestart = bind({
    dll: "kernel32.dll",
    entryPoint: "RegisterApplicationRestart",
    parameters: ["pointer", "u32"],
    returnType: "i32"
  });
  return ({ commandLine, flags }: {
    commandLine: string;
    flags: number;
  }) => {
    const memory = wideMemory(commandLine);
    try {
      return numberOf(registerApplicationRestart.invoke([pointerOf(memory), DynWin32.u32(flags)]).returnValue);
    } finally {
      memory.release();
    }
  };
}

const NO_PACKAGE = 15700;

/**
 * Reads whether the process has package identity (an MSIX or sparse package).
 *
 * @returns A function that answers it, which a call to `GetCurrentPackageFullName` decides.
 */
export function createPackageIdentityProbe() {
  const currentPackageFullName = bind({
    dll: "kernel32.dll",
    entryPoint: "GetCurrentPackageFullName",
    parameters: ["pointer", "pointer"],
    returnType: "i32"
  });
  return () => withMemory({
    size: Uint32Array.BYTES_PER_ELEMENT,
    alignment: Uint32Array.BYTES_PER_ELEMENT,
    use(length) {
      length.writeBytes(0, Buffer.alloc(Uint32Array.BYTES_PER_ELEMENT));
      const result = numberOf(currentPackageFullName.invoke([pointerOf(length), pointerOf(null)]).returnValue);
      return result !== NO_PACKAGE;
    }
  });
}
