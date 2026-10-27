import { boxedObject } from "#src/native-value.js";
import { GridUnitType, PropertyValue } from "#src/winui.js";

// WinRT's plain values, built the way the bindings take them.

/**
 * A string for an `object` property such as a button's content, which takes
 * only a boxed value.
 *
 * @param text - The string to box.
 * @returns The boxed string.
 */
export function boxed(text: string) {
  return boxedObject(PropertyValue.createString(text));
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
