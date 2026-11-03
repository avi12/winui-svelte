import type { FluentGlyphCode, FluentGlyphName } from "./fluent-glyph.ts";
import type { FontFamilyName } from "./font-family-name.ts";
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
  IReference_DateTime,
  IReference_Double,
  IReference_Point,
  IReference_Rect,
  IReference_TimeSpan,
  IVector_Object,
  Path,
  PathGeometry,
  PointCollection,
  projectAs,
  PropertyValue,
  RepeatBehaviorType,
  SolidColorBrush,
  Style,
  SvgImageSource,
  Uri,
  XamlReader
} from "./generated/bindings.ts";
import type {
  ControlTemplate,
  DataTemplate,
  Geometry,
  ImageSource,
  ItemsPanelTemplate,
  ResourceDictionary,
  UIElement
} from "./generated/bindings.ts";
import type { ThemeBrush } from "./generated/theme-brushes.ts";
import { mediaSeam } from "./media-seam.ts";
import type { ResourceRecordInput } from "./resource-record.ts";
import { styleTarget } from "./style-targets.ts";
import type {
  AttachedInput,
  ColorInput,
  ColorText,
  CornerRadiusInput,
  DateInput,
  DateTimeValue,
  DurationInput,
  FontWeightInput,
  GridLengthText,
  KeyTimeInput,
  MatrixInput,
  NumbersInput,
  ObjectInput,
  ObjectReferenceInput,
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
  colorOf,
  cornerSides,
  dateTicks,
  DurationKind,
  durationParts,
  fontWeightNumber,
  gridLengthParts,
  GridUnit,
  isResourceRecord,
  isSvgBytes,
  isSvgUri,
  numberList,
  parseColor,
  pathMarkup,
  pointList,
  RepeatKind,
  repeatParts,
  thicknessSides,
  ticksDate,
  ticksMilliseconds,
  timeSpanTicks
} from "./values.ts";
import { xamlSeam } from "./xaml-seam.ts";
import { styleOfClasses } from "#src/css/index.js";
import type { BoxedValue, NativeValue } from "#src/native-value.js";
import type { NodeAttachment } from "#src/renderer/host/control.js";
import { classNameOf } from "#src/renderer/host/host.js";
import { call, read, write } from "#src/renderer/host/reflect.js";
import { boxed, doubleCollection } from "#src/renderer/host/values.js";
import type { IMediaPlaybackSource } from "#winui/windows/media/playback/IMediaPlaybackSource";
import type { ClassValue } from "svelte/elements";

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
export { colorOf, glyphText as glyphOf } from "./values.ts";

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
  class?: ClassValue;
  style?: string;
  // An `@attach` on the component, handed on to its element.
  [attachment: symbol]: NodeAttachment;
}

/**
 * A member of an enum: its WinUI name (`"Compact"`) or its value
 * (`AppBarClosedDisplayMode.Compact`), and nothing else.
 */
export type EnumInput<Table extends Record<string, number>> = keyof Table | Table[keyof Table];

/**
 * A member of a flag enum (one WinUI marks `[Flags]`), or a list of member
 * names the prop combines (`["Control", "Shift"]`).
 */
export type FlagsInput<Table extends Record<string, number>> = EnumInput<Table> | ReadonlyArray<keyof Table>;

/** A grid track's size as the bindings take it. */
export interface GridLengthValue {
  value: number;
  gridUnitType: GridUnitType;
}

/** A grid length: pixels, "Auto", "*", "2*" as XAML writes them, or WinUI's own value. */
export type GridLengthInput = number | GridLengthText | GridLengthValue;

/**
 * The brush resources an app defines itself, by key. Augment it so a brush
 * prop takes their names too:
 * `declare module "winui-svelte/components" { interface AppBrushes { BrandBrush: true } }`.
 */
// eslint-disable-next-line @typescript-eslint/no-empty-object-type -- an app fills it by merging
export interface AppBrushes {}

declare const projection: unique symbol;

/**
 * The arguments of an event as WinUI hands them to a handler: a bare WinRT
 * object, not yet the class (`RoutedEventArgs`, `KeyRoutedEventArgs`) its
 * event is documented with. `Projection` names that class:
 * `projectAs(args, KeyRoutedEventArgs)` reads the arguments as one.
 */
export type EventArguments<Projection extends object> = object & {
  readonly [projection]?: Projection;
};

/** A color as text, one of WinUI's theme brushes (`ThemeBrush`), an app's own (`AppBrushes`), or a brush. */
export type BrushInput = ColorText | ThemeBrush | keyof AppBrushes | Brush;

/**
 * A URI string (a `.svg` is an SVG image, any other a bitmap), an image source,
 * or the bytes of an image file (SVG text is told by its `<svg` element).
 */
export type ImageSourceInput = string | ImageSource | Uint8Array | ArrayBuffer;

/** A media URI or a playback source (a MediaPlayerElement's `source`). */
export type MediaPlaybackSourceInput = string | IMediaPlaybackSource;

/** Path data as XAML writes it ("M0,0 L10,10 Z") or a geometry. */
export type GeometryInput = string | Geometry;

/** A font family name or a font family. */
export type FontFamilyInput = FontFamilyName | (string & Record<never, never>) | FontFamily;

/** An icon glyph: a Fluent name ("Save"), its code point (`FluentGlyph.Save`), code points to compose, or text. */
export type GlyphInput =
  | FluentGlyphName
  | FluentGlyphCode
  | (string & Record<never, never>)
  | readonly FluentGlyphCode[];

/** A URI string or a URI. */
export type UriInput = string | Uri;

/** XAML text (see `xamlOf`) or a ControlTemplate. */
export type ControlTemplateInput = string | ControlTemplate;

/** XAML text (see `xamlOf`) or a DataTemplate. */
export type DataTemplateInput = string | DataTemplate;

/** XAML text (see `xamlOf`) or an ItemsPanelTemplate. */
export type ItemsPanelTemplateInput = string | ItemsPanelTemplate;

/**
 * CSS class names (the rules a component's `<style>` declares for them make
 * the Style) or a Style.
 */
export type StyleInput = string | Style;

/**
 * What the build makes of a Style prop written in a component that has a
 * `<style>`: the value and the component's scope class, so the scoped rules
 * of that component match the class names.
 */
export type ScopedStyleInput = readonly [StyleInput | null | undefined, string];

/** A record of resources (see `ResourceRecordInput`) or a ResourceDictionary. */
export type ResourcesInput = ResourceRecordInput | ResourceDictionary;

/** A nullable boolean property such as ToggleButton.IsChecked. */
export type NullableBooleanInput = boolean | null;

/** A nullable number property (an animation's `to`): a number, or null for unset. */
export type NullableDoubleInput = number | null;

/** A time span (see `TimeSpanInput`), or null for unset (Timeline.beginTime). */
export type NullableTimeSpanInput = TimeSpanInput | null;

/** A date (see `DateInput`), or null for none picked (DatePicker.selectedDate). */
export type NullableDateInput = DateInput | null;

/** A point, or null for unset. */
export type NullablePointInput = PointInput | null;

/** A rect, or null for unset. */
export type NullableRectInput = RectInput | null;

/** A color (see `ColorInput`), or null for unset. */
export type NullableColorInput = ColorInput | null;

/**
 * The items a control shows: a WinRT collection (or null) as it is, or an
 * array, which is made a collection of boxed items.
 */
export type CollectionInput = ObjectReferenceInput | readonly ObjectInput[];

/** A list of points: points or text of coordinate pairs, or a `PointCollection`. */
export type PointCollectionInput = PointListInput | PointCollection;

/** A list of numbers (a dash pattern): numbers or text, or a `DoubleCollection`. */
export type DoubleCollectionInput = NumbersInput | DoubleCollection;

/** An input mode by name or number, several of them, or an `InputScope`. */
export type InputScopeInput =
  | EnumInput<typeof InputScopeNameValue>
  | ReadonlyArray<EnumInput<typeof InputScopeNameValue>>
  | InputScope;

// Built when used, not at import: a table that names a binding at the top
// level keeps that binding in the bundle of every app that imports this module.
function gridUnitTypes() {
  return new Map<GridUnit, GridUnitType>([
    [GridUnit.AUTO, GridUnitType.Auto],
    [GridUnit.PIXEL, GridUnitType.Pixel],
    [GridUnit.STAR, GridUnitType.Star]
  ]);
}

function durationTypes() {
  return new Map<DurationKind, DurationType>([
    [DurationKind.AUTOMATIC, DurationType.Automatic],
    [DurationKind.TIME_SPAN, DurationType.TimeSpan],
    [DurationKind.FOREVER, DurationType.Forever]
  ]);
}

function repeatBehaviorTypes() {
  return new Map<RepeatKind, RepeatBehaviorType>([
    [RepeatKind.COUNT, RepeatBehaviorType.Count],
    [RepeatKind.DURATION, RepeatBehaviorType.Duration],
    [RepeatKind.FOREVER, RepeatBehaviorType.Forever]
  ]);
}

function isList<Table extends Record<string, number>>(input: FlagsInput<Table>): input is ReadonlyArray<keyof Table> {
  return Array.isArray(input);
}

/**
 * A member of the enum table by name or value, or a flag enum's list of names
 * as their bits combined; throws a `RangeError` naming the members for
 * anything else.
 */
export function enumValue<Table extends Record<string, number>>({ table, input, prop }: {
  table: Table;
  input: FlagsInput<Table>;
  /** The prop that holds the value, named in the error. */
  prop?: string;
}) {
  const members: NativeValue[] = Object.values(table);
  // The bindings type a flag enum as its single members, while WinUI takes
  // any combination of their bits.
  function isValue(value: NativeValue): value is Table[keyof Table] {
    return members.includes(value) || isList(input);
  }

  let bits = 0;
  for (const part of isList(input) ? input : [input]) {
    const value = typeof part === "number" ? part : read(table, String(part));
    const isMember = members.includes(value);
    if (!isMember) {
      const subject = prop === undefined ? "" : `${prop}: `;
      throw new RangeError(`${subject}${JSON.stringify(part)} is not one of ${Object.keys(table).join(", ")}`);
    }

    bits = (bits | Number(value)) >>> 0;
  }

  if (isValue(bits)) {
    return bits;
  }

  throw new RangeError(String(input));
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

/**
 * A grid length prop as the bindings' `GridLength`; it also reads a track of
 * a Grid's `columns` or `rows` text, which `gridLengthParts` checks.
 */
export function gridLengthOf(input: number | string | GridLengthValue) {
  const isGridLength = typeof input === "object";
  if (isGridLength) {
    return input;
  }

  const parts = gridLengthParts(input);
  return {
    value: parts.value,
    gridUnitType: nativeMember({
      table: gridUnitTypes(),
      key: parts.unit
    })
  };
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

  return brushResource({
    found: resources.lookup(key),
    name: input
  });
}

// What `projectAs` calls on the class, reached from the class itself: an
// import of projectAs would add a module to every app that sets a brush.
const PROJECT_BORROWED = "_fromNativeBorrowed";

// A dictionary hands a resource back as a bare WinRT object, whatever it is
// (a ThemeBrush key included): it is a brush when it answers as one.
function brushResource({ found, name }: {
  found: unknown;
  name: string;
}) {
  const isObject = typeof found === "object" && found !== null;
  if (!isObject) {
    throw new TypeError(`the resource "${name}" is not a brush`);
  }

  const isProjected = isBrush(found);
  if (isProjected) {
    return found;
  }

  try {
    const projected = call(Brush, PROJECT_BORROWED, found);
    const isBrushProjection = typeof projected === "object" && projected !== null && isBrush(projected);
    if (isBrushProjection) {
      return projected;
    }
  } catch (error) {
    throw new TypeError(`the resource "${name}" is not a brush`, { cause: error });
  }

  throw new TypeError(`the resource "${name}" is not a brush`);
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
      table: durationTypes(),
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
      table: repeatBehaviorTypes(),
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

/** A point prop as the bindings' `Point`. */
export function pointOf(input: PointInput) {
  const isValue = "x" in input;
  if (isValue) {
    return input;
  }

  const [x, y] = input;
  return {
    x,
    y
  };
}

/** A size prop as the bindings' `Size`. */
export function sizeOf(input: SizeInput) {
  const isValue = "width" in input;
  if (isValue) {
    return input;
  }

  const [width, height] = input;
  return {
    width,
    height
  };
}

/** A rect prop as the bindings' `Rect`. */
export function rectOf(input: RectInput) {
  const isValue = "width" in input;
  if (isValue) {
    return input;
  }

  const [x, y, width, height] = input;
  return {
    x,
    y,
    width,
    height
  };
}

/** A matrix prop as the bindings' `Matrix`. */
export function matrixOf(input: MatrixInput) {
  const isValue = "m11" in input;
  if (isValue) {
    return input;
  }

  const [m11, m12, m21, m22, offsetX, offsetY] = input;
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
  const isValue = "z" in input;
  if (isValue) {
    return input;
  }

  const [x, y, depth] = input;
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

/** A nullable time span prop takes a boxed value. */
export function nullableTimeSpanOf(input: NullableTimeSpanInput) {
  const isUnset = input === null;
  return isUnset ? null : IReference_TimeSpan.from(PropertyValue.createTimeSpan(timeSpanOf(input)));
}

/** A nullable time span prop read back as milliseconds, or null. */
export function nullableTimeSpanInputOf(value: TimeSpanValue | null) {
  const isUnset = value === null;
  return isUnset ? null : timeSpanInputOf(value);
}

/** A nullable date prop takes a boxed value. */
export function nullableDateTimeOf(input: NullableDateInput) {
  const isUnset = input === null;
  return isUnset ? null : IReference_DateTime.from(PropertyValue.createDateTime(dateTimeOf(input)));
}

/** A nullable date prop read back as a `Date`, or null. */
export function nullableDateInputOf(value: DateTimeValue | null) {
  const isUnset = value === null;
  return isUnset ? null : dateInputOf(value);
}

/** A nullable point prop takes a boxed value. */
export function nullablePointOf(input: NullablePointInput) {
  const isUnset = input === null;
  return isUnset ? null : IReference_Point.from(PropertyValue.createPoint(pointOf(input)));
}

/** A nullable rect prop takes a boxed value. */
export function nullableRectOf(input: NullableRectInput) {
  const isUnset = input === null;
  return isUnset ? null : IReference_Rect.from(PropertyValue.createRect(rectOf(input)));
}

/** A nullable color prop: PropertyValue cannot box a color, so the color is handed on as it is. */
export function nullableColorOf(input: NullableColorInput) {
  const isUnset = input === null;
  return isUnset ? null : colorOf(input);
}

/** A list of points prop as a `PointCollection`; a collection is used as it is. */
export function pointCollectionOf(input: PointCollectionInput) {
  const isCollection = input instanceof PointCollection;
  if (isCollection) {
    return input;
  }

  const points = new PointCollection();
  for (const point of pointList(input)) {
    points.append(pointOf(point));
  }

  return points;
}

/** A list of numbers prop as a `DoubleCollection`; a collection is used as it is. */
export function doubleCollectionOf(input: DoubleCollectionInput) {
  const isCollection = input instanceof DoubleCollection;
  if (isCollection) {
    return input;
  }

  return doubleCollection([...numberList(input)]);
}

function isItemList(input: CollectionInput): input is readonly ObjectInput[] {
  return Array.isArray(input);
}

/** An items source prop as a collection: an array is made one, each item boxed as `objectOf` boxes it. */
export function collectionOf(input: CollectionInput) {
  const isList = isItemList(input);
  if (!isList) {
    return input;
  }

  return IVector_Object.create(input.map(item => objectOf(item)));
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

/**
 * An image source prop as an `ImageSource`; a string is the URI of an SVG image
 * when it ends in `.svg`, else of a bitmap.
 */
export function imageSourceOf(input: ImageSourceInput) {
  const isBuffer = input instanceof ArrayBuffer;
  const isBytes = isBuffer || input instanceof Uint8Array;
  if (isBytes) {
    const bytes = isBuffer ? new Uint8Array(input) : input;
    return mediaSeam().imageOfBytes({
      bytes,
      isSvg: isSvgBytes(bytes)
    });
  }

  const isSource = typeof input !== "string";
  if (isSource) {
    return input;
  }

  const isSvg = isSvgUri(input);
  if (isSvg) {
    const svg = new SvgImageSource();
    svg.uriSource = new Uri(input);
    return svg;
  }

  const image = new BitmapImage();
  image.uriSource = new Uri(input);
  return image;
}

/** A media prop as an `IMediaPlaybackSource`; a string is a URI, opened as a `MediaSource`. */
export function mediaPlaybackSourceOf(input: MediaPlaybackSourceInput) {
  const isSource = typeof input !== "string";
  if (isSource) {
    return input;
  }

  return mediaSeam().playbackSourceOf(input);
}

/**
 * A geometry prop as a `Geometry`; a string is path data, which XAML's reader
 * parses into the geometry of a Path. WinUI lets a geometry belong to one
 * owner, so it is taken from that Path before it is handed on.
 */
export function geometryOf(input: GeometryInput) {
  const isGeometry = typeof input !== "string";
  if (isGeometry) {
    return input;
  }

  const path = projectAs(XamlReader.load(pathMarkup(input)), Path);
  const geometry = projectAs(path.data, PathGeometry);
  write(path, "data", null);
  return geometry;
}

/** A template prop given XAML text loads it as a ControlTemplate; a ControlTemplate is used as it is. */
export function controlTemplateOf(input: ControlTemplateInput) {
  const isXaml = typeof input === "string";
  return isXaml ? xamlSeam().controlTemplate(input) : input;
}

/** A template prop given XAML text loads it as a DataTemplate; a DataTemplate is used as it is. */
export function dataTemplateOf(input: DataTemplateInput) {
  const isXaml = typeof input === "string";
  return isXaml ? xamlSeam().dataTemplate(input) : input;
}

/** A panel prop given XAML text loads it as an ItemsPanelTemplate; an ItemsPanelTemplate is used as it is. */
export function itemsPanelTemplateOf(input: ItemsPanelTemplateInput) {
  const isXaml = typeof input === "string";
  return isXaml ? xamlSeam().itemsPanelTemplate(input) : input;
}

function isStyle(value: object | null): value is Style {
  return value instanceof Style;
}

/**
 * A Style prop given class names gets the Style their rules make for the
 * element the prop styles (`itemContainerStyle` of a ListView styles its
 * ListViewItems); a Style is used as it is.
 *
 * @throws {Error} When the prop's element is not known for the control, or no rule matches the classes.
 */
export function styleOf({ input, owner, property }: {
  input: StyleInput | ScopedStyleInput;
  owner: object;
  property: string;
}) {
  const [written, scope] = Array.isArray(input) ? input : [input, ""];
  const isStyleObject = typeof written !== "string";
  if (isStyleObject) {
    return written;
  }

  const classNames = `${written} ${scope}`;
  const style = styleOfClasses({
    elementType: styleTarget({
      property,
      owner: classNameOf(owner)
    }),
    classNames
  });
  if (!isStyle(style)) {
    throw new Error(`no CSS rule matches "${written}" for ${property}: declare it in a <style> block`);
  }

  return style;
}

/**
 * A resources prop given a record makes a ResourceDictionary of it; a
 * ResourceDictionary is used as it is.
 */
export function resourcesOf(input: ResourcesInput) {
  return isResourceRecord(input) ? xamlSeam().resources(input) : input;
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
