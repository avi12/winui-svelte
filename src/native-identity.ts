import { call, isRecord, read } from "#src/renderer/host/reflect.js";

// dynwinrt keeps the native object of a projection in a member of this name.
const NATIVE_OBJECT_KEY = "_obj";

function nativeIdentityOf(value: object) {
  const nativeObject = read(value, NATIVE_OBJECT_KEY);
  const identity = isRecord(nativeObject) ? call(nativeObject, "identityRaw") : null;
  return typeof identity === "number" ? identity : null;
}

/**
 * What tells one WinUI control from another: every read of `parent` or a hit
 * test projects the native object into a new wrapper, so a control is known
 * by the identity of its native object.
 *
 * @param control - A projected WinUI object.
 * @returns A key the same for every wrapper of one native object (the wrapper for a non-projection).
 */
export function identityOf(control: object) {
  return nativeIdentityOf(control) ?? control;
}
