import type { RegistryBackend } from "./registry.ts";
import { DynWin32, DynWin32Unsafe } from "@microsoft/dynwinrt/win32/unsafe";
import type { DynWin32CallResult, DynWin32Value } from "@microsoft/dynwinrt/win32/unsafe";
import {
  bind,
  DWORD_BYTES,
  numberOf,
  pointerOf,
  WIDE_CHAR_BYTES,
  wideMemory,
  withMemory
} from "#src/win32-calls.js";

// The per-user registry hive (HKEY_CURRENT_USER) as the activation
// registrations use it. The hive is fixed here: nothing in the package can
// reach HKEY_LOCAL_MACHINE, which would need an administrator and change the
// machine for every user.

// HKEY_CURRENT_USER as a handle: 0x80000001, sign-extended as Windows defines it.
const HKEY_CURRENT_USER = 0xFFFFFFFF80000001n;
const REG_SZ = 1;
const RRF_RT_REG_SZ = 2;
const KEY_READ = 0x2_0019;
const ERROR_SUCCESS = 0;
const ERROR_FILE_NOT_FOUND = 2;
const MAX_VALUE_BYTES = 65_536;
const HANDLE_BYTES = 8;
const DATA_OFFSET = 8;
const QUERY_INFO_PARAMETERS = 12;
const SUB_KEY_COUNT_PARAMETER = 5;
const VALUE_COUNT_PARAMETER = 8;

function withText<T>({ text, use }: {
  text: string | null;
  use: (pointer: DynWin32Value) => T;
}) {
  const isNull = text === null;
  if (isNull) {
    return use(pointerOf(null));
  }

  const memory = wideMemory(text);
  try {
    return use(pointerOf(memory));
  } finally {
    memory.release();
  }
}

function requireSuccess({ code, operation }: {
  code: number;
  operation: string;
}) {
  const isFailure = code !== ERROR_SUCCESS;
  if (isFailure) {
    throw new Error(`${operation} failed with Windows error ${code}`);
  }
}

function requireSuccessOrMissing({ code, operation }: {
  code: number;
  operation: string;
}) {
  const isMissing = code === ERROR_FILE_NOT_FOUND;
  if (!isMissing) {
    requireSuccess({
      code,
      operation
    });
  }
}

function statusOf(result: DynWin32CallResult) {
  return numberOf(result.returnValue);
}

function nameOrNull(name: string) {
  const isDefault = name.length === 0;
  return isDefault ? null : name;
}

/**
 * The real backend: `advapi32` calls on `HKEY_CURRENT_USER`.
 *
 * @returns A backend over Win32.
 */
export function createWindowsRegistry() {
  function advapi({ entryPoint, parameters }: {
    entryPoint: string;
    parameters: string[];
  }) {
    return bind({
      dll: "advapi32.dll",
      entryPoint,
      parameters,
      returnType: "i32"
    });
  }
  const setValue = advapi({
    entryPoint: "RegSetKeyValueW",
    parameters: ["pointer", "pointer", "pointer", "u32", "pointer", "u32"]
  });
  const getValue = advapi({
    entryPoint: "RegGetValueW",
    parameters: ["pointer", "pointer", "pointer", "u32", "pointer", "pointer", "pointer"]
  });
  const deleteTree = advapi({
    entryPoint: "RegDeleteTreeW",
    parameters: ["pointer", "pointer"]
  });
  const deleteValue = advapi({
    entryPoint: "RegDeleteKeyValueW",
    parameters: ["pointer", "pointer", "pointer"]
  });
  const deleteKey = advapi({
    entryPoint: "RegDeleteKeyW",
    parameters: ["pointer", "pointer"]
  });
  const openKey = advapi({
    entryPoint: "RegOpenKeyExW",
    parameters: ["pointer", "pointer", "u32", "u32", "pointer"]
  });
  const closeKey = advapi({
    entryPoint: "RegCloseKey",
    parameters: ["pointer"]
  });
  const queryInfo = advapi({
    entryPoint: "RegQueryInfoKeyW",
    parameters: Array.from({ length: QUERY_INFO_PARAMETERS }, () => "pointer")
  });
  const root = DynWin32Unsafe.pointer(HKEY_CURRENT_USER);

  function withOpenKey<T>({ key, use }: {
    key: string;
    use: (handle: DynWin32Value) => T;
  }) {
    return withText({
      text: key,
      use: subKey => withMemory({
        size: HANDLE_BYTES,
        alignment: HANDLE_BYTES,
        use(out) {
          const code = statusOf(
            openKey.invoke([
              root,
              subKey,
              DynWin32.u32(0),
              DynWin32.u32(KEY_READ),
              pointerOf(out)
            ])
          );
          const isMissing = code === ERROR_FILE_NOT_FOUND;
          if (isMissing) {
            return undefined;
          }

          requireSuccess({
            code,
            operation: "RegOpenKeyExW"
          });
          const handle = DynWin32Unsafe.pointer(out.readU64(0));
          try {
            return use(handle);
          } finally {
            closeKey.invoke([handle]);
          }
        }
      })
    });
  }

  function isEmpty(key: string) {
    const isKeyEmpty = withOpenKey({
      key,
      use: handle => withMemory({
        size: 2 * DWORD_BYTES,
        alignment: DWORD_BYTES,
        use(counts) {
          const rest = Array.from({ length: QUERY_INFO_PARAMETERS - 1 }, () => pointerOf(null));
          rest[SUB_KEY_COUNT_PARAMETER - 2] = DynWin32Unsafe.pointer(counts.pointer(0).address);
          rest[VALUE_COUNT_PARAMETER - 2] = DynWin32Unsafe.pointer(counts.pointer(DWORD_BYTES).address);
          requireSuccess({
            code: statusOf(queryInfo.invoke([handle, ...rest])),
            operation: "RegQueryInfoKeyW"
          });
          return counts.readU32(0) === 0 && counts.readU32(DWORD_BYTES) === 0;
        }
      })
    });
    return isKeyEmpty ?? false;
  }

  return {
    setString({ key, name, value }) {
      const bytes = (value.length + 1) * WIDE_CHAR_BYTES;
      const data = wideMemory(value);
      try {
        withText({
          text: key,
          use: subKey => withText({
            text: nameOrNull(name),
            use: valueName => requireSuccess({
              code: statusOf(
                setValue.invoke([
                  root,
                  subKey,
                  valueName,
                  DynWin32.u32(REG_SZ),
                  pointerOf(data),
                  DynWin32.u32(bytes)
                ])
              ),
              operation: "RegSetKeyValueW"
            })
          })
        });
      } finally {
        data.release();
      }
    },
    readString({ key, name }) {
      return withText({
        text: key,
        use: subKey => withText({
          text: nameOrNull(name),
          use: valueName => withMemory({
            size: DATA_OFFSET + MAX_VALUE_BYTES,
            alignment: HANDLE_BYTES,
            use(buffer) {
              buffer.writeU32(0, MAX_VALUE_BYTES);
              const code = statusOf(
                getValue.invoke([
                  root,
                  subKey,
                  valueName,
                  DynWin32.u32(RRF_RT_REG_SZ),
                  pointerOf(null),
                  DynWin32Unsafe.pointer(buffer.pointer(DATA_OFFSET).address),
                  DynWin32Unsafe.pointer(buffer.pointer(0).address)
                ])
              );
              const isMissing = code === ERROR_FILE_NOT_FOUND;
              if (isMissing) {
                return undefined;
              }

              requireSuccess({
                code,
                operation: "RegGetValueW"
              });
              return buffer.readBytes(DATA_OFFSET, buffer.readU32(0)).toString("utf16le").replace(/\0+$/u, "");
            }
          })
        })
      });
    },
    hasKey(key) {
      const isOpened = withOpenKey({
        key,
        use: () => true
      });
      return isOpened ?? false;
    },
    deleteTree(key) {
      withText({
        text: key,
        use: subKey => requireSuccessOrMissing({
          code: statusOf(deleteTree.invoke([root, subKey])),
          operation: "RegDeleteTreeW"
        })
      });
    },
    deleteValue({ key, name }) {
      withText({
        text: key,
        use: subKey => withText({
          text: nameOrNull(name),
          use: valueName => requireSuccessOrMissing({
            code: statusOf(deleteValue.invoke([root, subKey, valueName])),
            operation: "RegDeleteKeyValueW"
          })
        })
      });
    },
    deleteKeyIfEmpty(key) {
      const canDelete = isEmpty(key);
      if (!canDelete) {
        return false;
      }

      withText({
        text: key,
        use: subKey => requireSuccess({
          code: statusOf(deleteKey.invoke([root, subKey])),
          operation: "RegDeleteKeyW"
        })
      });
      return true;
    }
  } satisfies RegistryBackend;
}
