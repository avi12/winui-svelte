import { unboxObject } from "@microsoft/dynwinrt";
import { boxedObject } from "#src/native-value.js";
import { GridUnitType, PropertyValue } from "#src/winui.js";

// WinRT's plain values, built the way the bindings take them.

const INT32_BITS = 32;
const MAX_INT32 = 2 ** (INT32_BITS - 1) - 1;

/** What `boxed` takes: the plain values WinRT can box for an `object` property. */
export type Boxable = string | number | boolean;

function isInt32(value: number) {
  return Number.isInteger(value) && Math.abs(value) <= MAX_INT32;
}

/**
 * A plain value for an `object` property such as a button's content, a list's
 * item or a control's `Tag`, which takes only a boxed value. A string is boxed
 * as a string, a boolean as a boolean, and a number as an Int32 when it is a
 * whole number that fits, else as a Double. `unboxed` reads it back.
 *
 * @param value - The string, number or boolean to box.
 * @returns The boxed value.
 */
export function boxed(value: Boxable) {
  const isText = typeof value === "string";
  if (isText) {
    return boxedObject(PropertyValue.createString(value));
  }

  const isFlag = typeof value === "boolean";
  if (isFlag) {
    return boxedObject(PropertyValue.createBoolean(value));
  }

  return boxedObject(isInt32(value) ? PropertyValue.createInt32(value) : PropertyValue.createDouble(value));
}

/**
 * What a boxed value holds: the inverse of `boxed`, for what an event reports
 * as an `object` (a `Tag`, an `InvokedItem`, a `SelectedValue`).
 *
 * @param value - A boxed value, or an object that is not one.
 * @returns The string, number, boolean or bigint inside a box; null for null or undefined; any other object as it is.
 */
export function unboxed(value: unknown) {
  const isEmpty = value === null || value === undefined;
  return isEmpty ? null : unboxObject(value);
}

/**
 * A `Thickness`, from its four sides.
 *
 * @param sides - The width of each side.
 * @returns The value to set on a margin, padding or border thickness.
 */
export function thickness({ left, top, right, bottom }: {
  left: number;
  top: number;
  right: number;
  bottom: number;
}) {
  return {
    left,
    top,
    right,
    bottom
  };
}

/**
 * A `GridLength` that takes a share of the space left over.
 *
 * @param value - The share's weight; `*` alone weighs 1.
 * @returns The value to set on a column's width or a row's height.
 */
export function starLength(value = 1) {
  return {
    value,
    gridUnitType: GridUnitType.Star
  };
}

/**
 * A `GridLength` that fits its content.
 *
 * @returns The value to set on a column's width or a row's height.
 */
export function autoLength() {
  return {
    value: 1,
    gridUnitType: GridUnitType.Auto
  };
}

/**
 * A `GridLength` in device-independent pixels.
 *
 * @param value - The length in pixels.
 * @returns The value to set on a column's width or a row's height.
 */
export function pixelLength(value: number) {
  return {
    value,
    gridUnitType: GridUnitType.Pixel
  };
}
