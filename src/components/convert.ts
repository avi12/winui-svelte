import {
  Application,
  BitmapImage,
  Brush,
  FontFamily,
  GridUnitType,
  IReference_Boolean,
  IReference_Double,
  PropertyValue,
  SolidColorBrush,
  Uri
} from "./generated/bindings.ts";
import type { ImageSource, UIElement } from "./generated/bindings.ts";
import type {
  AttachedInput,
  ColorInput,
  CornerRadiusInput,
  ObjectInput,
  ThicknessInput
} from "./values.ts";
import {
  attachedList,
  cornerSides,
  gridLengthParts,
  GridUnit,
  parseColor,
  thicknessSides
} from "./values.ts";
import type { BoxedValue, NativeValue } from "#src/native-value.js";
import type { NodeAttachment } from "#src/renderer/host/control.js";
import { read } from "#src/renderer/host/reflect.js";
import { boxed } from "#src/renderer/host/values.js";

// A prop's value as the bindings take it: the generated components call these
// where a prop is not already the bindings' own type.

export type {
  AttachedInput,
  ColorInput,
  CornerRadiusInput,
  ObjectInput,
  ObjectReferenceInput,
  ThicknessInput
} from "./values.ts";

/**
 * RelativePanel places an element by another element, or by that element's
 * name.
 */
export type ElementReferenceInput = string | UIElement;

/**
 * What every component takes besides its control's properties; the element
 * itself gets them (the CSS runtime reads them).
 */
export interface ElementProps {
  class?: string;
  style?: string;
  // An `@attach` on the component, handed on to its element.
  [attachment: symbol]: NodeAttachment;
}

/**
 * A member of an enum by name or value. A flag enum also takes a combination
 * of its members' values.
 */
export type EnumInput<Table extends Record<string, number>> = keyof Table | number;

/** A grid track's size as the bindings take it. */
export interface GridLengthValue {
  value: number;
  gridUnitType: GridUnitType;
}

/** A grid length: pixels, "Auto", "*", "2*" as XAML writes them, or WinUI's own value. */
export type GridLengthInput = number | string | GridLengthValue;

/** A color string (see `ColorInput`), a theme resource name, or a brush. */
export type BrushInput = string | Brush;

/** A URI string or an image source. */
export type ImageSourceInput = string | ImageSource;

/** A font family name or a font family. */
export type FontFamilyInput = string | FontFamily;

/** A URI string or a URI. */
export type UriInput = string | Uri;

/** A nullable boolean property such as ToggleButton.IsChecked. */
export type NullableBooleanInput = boolean | null;

/** A nullable number property (an animation's `to`): a number, or null for unset. */
export type NullableDoubleInput = number | null;

const GRID_UNIT_TYPES = new Map<GridUnit, GridUnitType>([
  [GridUnit.AUTO, GridUnitType.Auto],
  [GridUnit.PIXEL, GridUnitType.Pixel],
  [GridUnit.STAR, GridUnitType.Star]
]);

function isFlagMask(members: readonly number[]) {
  const flags = members.filter(member => member !== 0);
  const isEachABit = flags.every(member => (member & (member - 1)) === 0);
  return flags.length > 1 && isEachABit;
}

// A guard for the table's members: a number is one, or a combination of the
// bits of a flag enum's members.
function memberGuard<Table extends Record<string, number>>(table: Table) {
  const members: number[] = Object.values(table);
  let mask = 0;
  for (const member of members) {
    mask |= member;
  }

  const isFlagEnum = isFlagMask(members);
  return (value: NativeValue): value is Table[keyof Table] => {
    const isCombination = typeof value === "number" && isFlagEnum && (value & ~mask) === 0;
    return members.some(member => member === value) || isCombination;
  };
}

/** A member of the enum table by name or number; throws a `RangeError` naming the members when it is none. */
export function enumValue<Table extends Record<string, number>>({ table, input }: {
  table: Table;
  input: EnumInput<Table>;
}) {
  const isNumber = typeof input === "number";
  const value: NativeValue = isNumber ? input : read(table, String(input));
  const isMember = memberGuard(table);
  if (isMember(value)) {
    return value;
  }

  throw new RangeError(`${String(input)} is not one of ${Object.keys(table).join(", ")}`);
}

/** A thickness prop as the bindings' `Thickness`. */
export function thicknessOf(input: ThicknessInput) {
  const [left, top, right, bottom] = thicknessSides(input);
  return {
    left,
    top,
    right,
    bottom
  };
}

/** A corner radius prop as the bindings' `CornerRadius`. */
export function cornerRadiusOf(input: CornerRadiusInput) {
  const [topLeft, topRight, bottomRight, bottomLeft] = cornerSides(input);
  return {
    topLeft,
    topRight,
    bottomRight,
    bottomLeft
  };
}

/** A grid length prop as the bindings' `GridLength`. */
export function gridLengthOf(input: GridLengthInput) {
  const isGridLength = typeof input === "object";
  if (isGridLength) {
    return input;
  }

  const parts = gridLengthParts(input);
  const gridUnitType = GRID_UNIT_TYPES.get(parts.unit);
  const isKnownUnit = gridUnitType !== undefined;
  if (!isKnownUnit) {
    throw new RangeError(`no grid unit for ${parts.unit}`);
  }

  return {
    value: parts.value,
    gridUnitType
  };
}

/** A color prop as the bindings' `Color`; throws a `TypeError` for text that is not a color. */
export function colorOf(input: ColorInput) {
  const isColor = typeof input === "object";
  if (isColor) {
    return input;
  }

  const color = parseColor(input);
  const isParsed = color !== null;
  if (!isParsed) {
    throw new TypeError(`"${input}" is not a color (#rgb, #rrggbb or #aarrggbb)`);
  }

  return color;
}

function isBrush(value: object): value is Brush {
  return value instanceof Brush;
}

/**
 * A color makes a solid brush; any other string names a theme resource of the
 * application, which holds the brush.
 */
export function brushOf(input: BrushInput) {
  const isBrushValue = typeof input === "object";
  if (isBrushValue) {
    return input;
  }

  const color = parseColor(input);
  const isColor = color !== null;
  if (isColor) {
    return new SolidColorBrush(color);
  }

  const resources = Application.current.resources;
  const key = PropertyValue.createString(input);
  const isResource = resources.hasKey(key);
  if (!isResource) {
    throw new TypeError(`"${input}" is neither a color nor a resource the application holds`);
  }

  const found = resources.lookup(key);
  const isBrushResource = typeof found === "object" && found !== null && isBrush(found);
  if (!isBrushResource) {
    throw new TypeError(`the resource "${input}" is not a brush`);
  }

  return found;
}

/** A nullable boolean property (ToggleButton.IsChecked) takes a boxed value. */
export function nullableBooleanOf(isOn: NullableBooleanInput) {
  const isUnset = isOn === null;
  return isUnset ? null : IReference_Boolean.from(PropertyValue.createBoolean(isOn));
}

/** A nullable number property (DoubleAnimation.To) takes a boxed value. */
export function nullableDoubleOf(input: NullableDoubleInput) {
  const isUnset = input === null;
  return isUnset ? null : IReference_Double.from(PropertyValue.createDouble(input));
}

/** A URI prop as a `Uri`. */
export function uriOf(input: UriInput) {
  const isText = typeof input === "string";
  return isText ? new Uri(input) : input;
}

/** A font family prop as a `FontFamily`. */
export function fontFamilyOf(input: FontFamilyInput) {
  const isText = typeof input === "string";
  return isText ? new FontFamily(input) : input;
}

/** An image source prop as an `ImageSource`; a string is the URI of a bitmap. */
export function imageSourceOf(input: ImageSourceInput) {
  const isSource = typeof input !== "string";
  if (isSource) {
    return input;
  }

  const image = new BitmapImage();
  image.uriSource = new Uri(input);
  return image;
}

/**
 * A property of type object takes only a boxed value: a string, number or
 * boolean is boxed, anything else is the WinRT object it already is.
 */
export function objectOf(input: ObjectInput) {
  const isBoxable = typeof input === "string" || typeof input === "boolean" || typeof input === "number";
  return isBoxable ? boxed(input) : input;
}

/**
 * An object property read back, for a bindable prop: the bindings type it
 * unknown (an IInspectable they cannot name). A value no prop could have set
 * reads as null.
 */
export function objectInputOf(value: BoxedValue) {
  const isObjectInput =
    typeof value === "string" ||
    typeof value === "number" ||
    typeof value === "boolean" ||
    typeof value === "object" ||
    typeof value === "function";
  return isObjectInput ? value : null;
}

/** Calls each Owner.set<Property>(control, value) an `attached` prop lists. */
export function setAttached({ control, input }: {
  control: object;
  input: AttachedInput;
}) {
  for (const [owner, property, value] of attachedList(input)) {
    const setter = read(owner, `set${property}`);
    const isFunction = typeof setter === "function";
    if (!isFunction) {
      throw new TypeError(`attached={[Owner, "${property}", …]}: the owner has no set${property}`);
    }

    setter.apply(owner, [control, value]);
  }
}
