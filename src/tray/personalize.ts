import { bindDll, wideMemory, withMemory } from "#src/win32-calls.js";

const DWORD_BYTES = 4;
const HKEY_CURRENT_USER = 0x80000001n;
const REG_DWORD_ONLY = 0x10;
const PERSONALIZE_KEY = String.raw`Software\Microsoft\Windows\CurrentVersion\Themes\Personalize`;

/** The two light-or-dark switches of Windows' personalization settings. */
export const PersonalizeValue = {
  TASKBAR_IS_LIGHT: "SystemUsesLightTheme",
  APPS_ARE_LIGHT: "AppsUseLightTheme"
} as const;

/** One of `PersonalizeValue`'s values. */
export type PersonalizeValue = typeof PersonalizeValue[keyof typeof PersonalizeValue];

/**
 * Reads one personalization switch from the registry, bound when this is called.
 *
 * @param options - `value`: the switch; `isLightWhenMissing`: the answer when the registry has no value.
 * @returns A function that is true while the switch says light, read fresh on each call so a change is seen.
 */
export function createLightReader({ value, isLightWhenMissing }: {
  readonly value: PersonalizeValue;
  readonly isLightWhenMissing: boolean;
}) {
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
      const valueName = wideMemory(value);
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
        const isMissing = result !== 0;
        return isMissing ? isLightWhenMissing : buffer.readU32(0) !== 0;
      } finally {
        subKey.release();
        valueName.release();
      }
    }
  });
}
