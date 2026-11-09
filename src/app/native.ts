import { DynWin32 } from "@microsoft/dynwinrt/win32/unsafe";
import { bind, numberOf, pointerOf, wideMemory } from "#src/win32-calls.js";

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
