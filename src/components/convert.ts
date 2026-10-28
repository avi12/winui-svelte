import {
  Application,
  BitmapImage,
  Brush,
  DoubleCollection,
  DurationType,
  FontFamily,
  GridUnitType,
  InputScope,
  InputScopeName,
  InputScopeNameValue,
  IReference_Boolean,
  IReference_Double,
  PointCollection,
  PropertyValue,
  RepeatBehaviorType,
  SolidColorBrush,
  Uri
} from "./generated/bindings.ts";
import type { ImageSource, UIElement } from "./generated/bindings.ts";
import type {
  AttachedInput,
  ColorInput,
  CornerRadiusInput,
  DateInput,
  DateTimeValue,
  DurationInput,
  FontWeightInput,
  FontWeightValue,
  KeyTimeInput,
  MatrixInput,
  NumbersInput,
  ObjectInput,
  PointInput,
  PointListInput,
  RectInput,
  RepeatBehaviorInput,
  SizeInput,
  ThicknessInput,
  TimeSpanInput,
  TimeSpanValue,
  Vector3Input
} from "./values.ts";
import {
  attachedList,
  cornerSides,
  dateTicks,
  DurationKind,
  durationParts,
  fontWeightNumber,
  gridLengthParts,
  GridUnit,
  matrixCells,
  numberList,
  parseColor,
  pointCoordinates,
  pointList,
  rectBounds,
  RepeatKind,
  repeatParts,
  sizeDimensions,
  thicknessSides,
  ticksDate,
  ticksMilliseconds,
  timeSpanTicks,
  vectorComponents
} from "./values.ts";
import type { BoxedValue, NativeValue } from "#src/native-value.js";
import { boxedObject } from "#src/native-value.js";
import type { NodeAttachment } from "#src/renderer/host/control.js";
import { read } from "#src/renderer/host/reflect.js";

// A prop's value as the bindings take it: the generated components call these
// where a prop is not already the bindings' own type.

export type {
  AttachedInput,
  ColorInput,
  CornerRadiusInput,
  DateInput,
  DurationInput,
  FontWeightInput,
  KeyTimeInput,
  MatrixInput,
  NumbersInput,
  ObjectInput,
  ObjectReferenceInput,
  PointInput,
  RectInput,
  RepeatBehaviorInput,
  SizeInput,
  ThicknessInput,
  TimeSpanInput,
  Vector3Input
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

/** A list of points: points or text of coordinate pairs, or a `PointCollection`. */
export type PointCollectionInput = PointListInput | PointCollection;

/** A list of numbers (a dash pattern): numbers or text, or a `DoubleCollection`. */
export type DoubleCollectionInput = NumbersInput | DoubleCollection;

/** An input mode by name or number, several of them, or an `InputScope`. */
export type InputScopeInput =
  | EnumInput<typeof InputScopeNameValue>
  | ReadonlyArray<EnumInput<typeof InputScopeNameValue>>
  | InputScope;

const GRID_UNIT_TYPES = new Map<GridUnit, GridUnitType>([
  [GridUnit.AUTO, GridUnitType.Auto],
  [GridUnit.PIXEL, GridUnitType.Pixel],
  [GridUnit.STAR, GridUnitType.Star]
]);
const DURATION_TYPES = new Map<DurationKind, DurationType>([
  [DurationKind.AUTOMATIC, DurationType.Automatic],
  [DurationKind.TIME_SPAN, DurationType.TimeSpan],
  [DurationKind.FOREVER, DurationType.Forever]
]);
const REPEAT_BEHAVIOR_TYPES = new Map<RepeatKind, RepeatBehaviorType>([
  [RepeatKind.COUNT, RepeatBehaviorType.Count],
  [RepeatKind.DURATION, RepeatBehaviorType.Duration],
  [RepeatKind.FOREVER, RepeatBehaviorType.Forever]
]);
const INT32_BITS = 32;
const MAX_INT32 = 2 ** (INT32_BITS - 1) - 1;

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

// The bindings' member for a parsed kind; a kind the table lacks is a bug here.
function nativeMember<Key extends string, Member>({ table, key }: {
  table: ReadonlyMap<Key, Member>;
  key: Key;
}) {
  const member = table.get(key);
  const isKnown = member !== undefined;
  if (!isKnown) {
    throw new RangeError(`no bindings member for ${key}`);
  }

  return member;
}

/** A grid length prop as the bindings' `GridLength`. */
export function gridLengthOf(input: GridLengthInput) {
  const isGridLength = typeof input === "object";
  if (isGridLength) {
    return input;
  }

  const parts = gridLengthParts(input);
  return {
    value: parts.value,
    gridUnitType: nativeMember({
      table: GRID_UNIT_TYPES,
      key: parts.unit
    })
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

/** A time span prop as the bindings' `TimeSpan`; throws a `TypeError` for text that is not one. */
export function timeSpanOf(input: TimeSpanInput) {
  const isValue = typeof input === "object";
  if (isValue) {
    return input;
  }

  return { duration: timeSpanTicks(input) };
}

/** A time span prop read back as milliseconds. */
export function timeSpanInputOf(value: TimeSpanValue) {
  return ticksMilliseconds(value.duration);
}

/** A duration prop as the bindings' `Duration`. */
export function durationOf(input: DurationInput) {
  const isValue = typeof input === "object";
  if (isValue) {
    return input;
  }

  const { kind, ticks } = durationParts(input);
  return {
    timeSpan: {
      duration: ticks
    },
    type: nativeMember({
      table: DURATION_TYPES,
      key: kind
    })
  };
}

/** A key time prop as the bindings' `KeyTime`. */
export function keyTimeOf(input: KeyTimeInput) {
  const isValue = typeof input === "object";
  if (isValue) {
    return input;
  }

  return {
    timeSpan: {
      duration: timeSpanTicks(input)
    }
  };
}

/** A repeat behavior prop as the bindings' `RepeatBehavior`. */
export function repeatBehaviorOf(input: RepeatBehaviorInput) {
  const isValue = typeof input === "object";
  if (isValue) {
    return input;
  }

  const { kind, count, ticks } = repeatParts(input);
  return {
    count,
    duration: {
      duration: ticks
    },
    type: nativeMember({
      table: REPEAT_BEHAVIOR_TYPES,
      key: kind
    })
  };
}

/** A font weight prop as the bindings' `FontWeight`; throws a `RangeError` for a weight that is none. */
export function fontWeightOf(input: FontWeightInput) {
  const isValue = typeof input === "object";
  if (isValue) {
    return input;
  }

  return { weight: fontWeightNumber(input) };
}

/** A font weight prop read back as its number. */
export function fontWeightInputOf(value: FontWeightValue) {
  return value.weight;
}

/** A point prop as the bindings' `Point`. */
export function pointOf(input: PointInput) {
  const [x, y] = pointCoordinates(input);
  return {
    x,
    y
  };
}

/** A size prop as the bindings' `Size`. */
export function sizeOf(input: SizeInput) {
  const [width, height] = sizeDimensions(input);
  return {
    width,
    height
  };
}

/** A rect prop as the bindings' `Rect`. */
export function rectOf(input: RectInput) {
  const [x, y, width, height] = rectBounds(input);
  return {
    x,
    y,
    width,
    height
  };
}

/** A matrix prop as the bindings' `Matrix`. */
export function matrixOf(input: MatrixInput) {
  const [m11, m12, m21, m22, offsetX, offsetY] = matrixCells(input);
  return {
    m11,
    m12,
    m21,
    m22,
    offsetX,
    offsetY
  };
}

/** A vector prop as the bindings' `Vector3`. */
export function vector3Of(input: Vector3Input) {
  const [x, y, depth] = vectorComponents(input);
  return {
    x,
    y,
    z: depth
  };
}

/** A date prop as the bindings' `DateTime`; throws a `TypeError` for text that is not a date. */
export function dateTimeOf(input: DateInput) {
  const isValue = typeof input === "object" && "universalTime" in input;
  if (isValue) {
    return input;
  }

  return { universalTime: dateTicks(input) };
}

/** A date prop read back as a `Date`. */
export function dateInputOf(value: DateTimeValue) {
  return ticksDate(value.universalTime);
}

/** A list of points prop as a `PointCollection`; a collection is used as it is. */
export function pointCollectionOf(input: PointCollectionInput) {
  const isCollection = input instanceof PointCollection;
  if (isCollection) {
    return input;
  }

  const points = new PointCollection();
  for (const [x, y] of pointList(input)) {
    points.append({
      x,
      y
    });
  }

  return points;
}

/** A list of numbers prop as a `DoubleCollection`; a collection is used as it is. */
export function doubleCollectionOf(input: DoubleCollectionInput) {
  const isCollection = input instanceof DoubleCollection;
  if (isCollection) {
    return input;
  }

  const numbers = new DoubleCollection();
  for (const value of numberList(input)) {
    numbers.append(value);
  }

  return numbers;
}

/** An input scope prop as an `InputScope` holding a name for each member. */
export function inputScopeOf(input: InputScopeInput) {
  const isScope = input instanceof InputScope;
  if (isScope) {
    return input;
  }

  const scope = new InputScope();
  const names = scope.names;
  const hasNames = names !== null;
  if (!hasNames) {
    throw new Error("a new input scope holds no list of names");
  }

  const isList = typeof input === "object";
  const members = isList ? input : [input];
  for (const member of members) {
    names.append(
      new InputScopeName(
        enumValue({
          table: InputScopeNameValue,
          input: member
        })
      )
    );
  }

  return scope;
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
  const isText = typeof input === "string";
  if (isText) {
    return boxedObject(PropertyValue.createString(input));
  }

  const isFlag = typeof input === "boolean";
  if (isFlag) {
    return boxedObject(PropertyValue.createBoolean(input));
  }

  const isNumber = typeof input === "number";
  if (isNumber) {
    const isInteger = Number.isInteger(input) && Math.abs(input) <= MAX_INT32;
    return isInteger ? boxedObject(PropertyValue.createInt32(input)) : boxedObject(PropertyValue.createDouble(input));
  }

  return input;
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
