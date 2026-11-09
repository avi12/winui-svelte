// The Win32 seam: the few pieces a consumer needs to call a function of a
// DLL that WinRT has no equivalent for, over the same binder the package uses.
// An escape hatch, not a stable API: parameter and return types are strings,
// the caller owns the lifetime of memory it allocates, and
// `@microsoft/dynwinrt` is a preview, so this surface may change with it.
// `bind` takes values that `DynWin32` makes; `bindDll` takes plain numbers,
// bigints, strings and memory and gives back plain numbers and addresses.
// The registry has its own typed entry (`winui-svelte/app/activation`).
export {
  addressOf,
  bind,
  bindDll,
  numberOf,
  pointerOf,
  WIDE_CHAR_BYTES,
  wideMemory,
  withMemory
} from "#src/win32-calls.js";
export { hasPackageIdentity } from "#src/window/package-identity.js";
