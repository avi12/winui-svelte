import type { ThemedIconExtra } from "./tray-extras.ts";
import { bindDll, wideMemory, withMemory } from "#src/win32-calls.js";

const DWORD_BYTES = 4;
const HKEY_CURRENT_USER = 0x80000001n;
const REG_DWORD_ONLY = 0x10;
const PERSONALIZE_KEY = String.raw`Software\Microsoft\Windows\CurrentVersion\Themes\Personalize`;
const LIGHT_THEME_VALUE = "SystemUsesLightTheme";

/**
 * The extra that lets a tray icon's `icon` be `{ forLightTaskbar, forDarkTaskbar }`: pass it in `extras`
 * and the picture follows the taskbar's theme. Without it the registry read is not in the bundle.
 */
export const themedIcon: ThemedIconExtra = {
  kind: "themedIcon",
  createReader() {
    const { registryValue } = bindDll({
      dll: "advapi32.dll",
      functions: {
        registryValue: ["RegGetValueW", ["pointer", "pointer", "pointer", "u32", "pointer", "pointer", "pointer"], "i32"]
      }
    });
    return () => withMemory({
      size: 2 * DWORD_BYTES,
      alignment: DWORD_BYTES,
      use(buffer) {
        buffer.writeU32(DWORD_BYTES, DWORD_BYTES);
        const subKey = wideMemory(PERSONALIZE_KEY);
        const valueName = wideMemory(LIGHT_THEME_VALUE);
        try {
          const result = registryValue(
            HKEY_CURRENT_USER,
            subKey,
            valueName,
            REG_DWORD_ONLY,
            null,
            buffer,
            buffer.pointer(DWORD_BYTES).address
          );
          return result === 0 && buffer.readU32(0) !== 0;
        } finally {
          subKey.release();
          valueName.release();
        }
      }
    });
  }
};
