import type { NativeValue } from "#src/native-value.js";

// Reading and writing a native control by property name, for the renderer,
// which knows a control only by the kebab-case tag it was made from. read,
// call and write are accessors, positional like Reflect.get: the target, then
// the key, then what the operation takes.

/**
 * Whether a native value is an object (or function) whose members can be read by name.
 *
 * @param value - Any value WinUI handed over.
 * @returns True when `value` is a non-null object or function.
 */
export function isRecord(value: NativeValue): value is Record<string, NativeValue> {
  return (typeof value === "object" || typeof value === "function") && value !== null;
}

type NativeMethod = (...values: NativeValue[]) => NativeValue;

// WinUI's methods are plain functions taking and returning native values; a
// bare function guard would leave their result typed as any.
function isMethod(value: NativeValue): value is NativeMethod {
  return typeof value === "function";
}

/**
 * Reads a member of a native value by name.
 *
 * @param target - The native value.
 * @param key - The member's name.
 * @returns The member, or `undefined` when `target` has no members to read.
 */
// eslint-disable-next-line no-restricted-syntax -- an accessor, positional like Reflect.get
export function read(target: NativeValue, key: string) {
  return isRecord(target) ? target[key] : undefined;
}

/**
 * Calls a method of a native value by name.
 *
 * @param target - The native value.
 * @param key - The method's name.
 * @param values - The arguments to call it with.
 * @returns What the method returns.
 * @throws {TypeError} When `target` has no such method.
 */
// eslint-disable-next-line no-restricted-syntax -- an accessor, positional like Reflect.apply
export function call(target: NativeValue, key: string, ...values: NativeValue[]) {
  const method = read(target, key);
  if (!isMethod(method)) {
    throw new TypeError(`WinUI has no ${key} here`);
  }

  return method.apply(target, values);
}

/**
 * Sets a member of a native object by name.
 *
 * @param target - The native object.
 * @param key - The member's name.
 * @param value - What to set it to.
 */
// eslint-disable-next-line no-restricted-syntax -- an accessor, positional like Reflect.set
export function write(target: object, key: string, value: NativeValue) {
  Object.assign(target, { [key]: value });
}
