import type { CssNative } from "./runtime.ts";
import { installCssRuntime } from "./runtime.ts";
import { XAML_NAMESPACES } from "#src/css/translate/cascade.js";
import type { BoxedValue, NativeValue } from "#src/native-value.js";

interface ProjectedType<Instance extends object> {
  readonly prototype: Instance;
}

interface DictionaryLike {
  lookup(key: BoxedValue): BoxedValue;
}

interface StoryboardLike {
  children: {
    size: number;
    getAt(index: number): object;
  };
  begin(): void;
  pause(): void;
  stop(): void;
}

interface ListLike {
  append(item: object): void;
  clear(): void;
  indexOf(item: object): number;
  removeAt(index: number): void;
}

/* eslint-disable @typescript-eslint/naming-convention -- CssWinui mirrors WinUI's projected, PascalCase names. */

/**
 * The WinUI the CSS runtime touches: the package's WinUI import site (the
 * module namespace), so the runtime names no binding path.
 */
export interface CssWinui {
  Application: {
    current: {
      resources: DictionaryLike & { mergedDictionaries: ListLike | null };
    };
  };
  ResourceDictionary: ProjectedType<DictionaryLike>;
  Style: ProjectedType<object>;
  Storyboard: ProjectedType<StoryboardLike> & {
    setTarget(timeline: object, target: object): void;
    getTargetProperty(timeline: object): string;
    setTargetProperty(timeline: object, path: string): void;
  };
  CompositeTransform: new () => object;
  RectangleGeometry: ProjectedType<object>;
  SolidColorBrush: ProjectedType<object>;
  XamlReader: { load(xaml: string): BoxedValue };
  PropertyValue: { createString(value: string): BoxedValue };
  projectAs<Instance extends object>(value: BoxedValue, type: ProjectedType<Instance>): Instance;
  ColumnDefinition: new () => object;
  RowDefinition: new () => object;
  GridUnitType: {
    Auto: number;
    Pixel: number;
    Star: number;
  };
}

/* eslint-enable @typescript-eslint/naming-convention */

const LIST_SEPARATOR = ",";
// A color animation names the brush of the element (`Background.(SolidColorBrush.Color)`):
// the runtime targets the element's own brush by its Color, whatever the element's type.
const BRUSH_COLOR_PATH = /^(\w)(\w*)\.\(SolidColorBrush\.Color\)$/u;
const BRUSH_COLOR = "Color";
const STAR_SUFFIX = "*";
const AUTO_LENGTH = "Auto";

function isRecord(value: NativeValue): value is Record<string, NativeValue> {
  return (typeof value === "object" || typeof value === "function") && value !== null;
}

function readMember({ target, key }: {
  target: NativeValue;
  key: string;
}) {
  return isRecord(target) ? target[key] : undefined;
}

function isDictionary(value: NativeValue): value is DictionaryLike {
  return isRecord(value) && typeof value["lookup"] === "function";
}

function isList(value: NativeValue): value is ListLike {
  return isRecord(value) && ["append", "clear", "indexOf", "removeAt"].every(method => typeof value[method] === "function");
}

function isEventMethod(value: NativeValue): value is (handler: () => void) => NativeValue {
  return typeof value === "function";
}

// "Auto", "*", "2*" or pixels, as WinUI's GridLength.
function gridLength({ winui, text }: {
  winui: CssWinui;
  text: string;
}) {
  const isAuto = text === AUTO_LENGTH;
  if (isAuto) {
    return {
      value: 1,
      gridUnitType: winui.GridUnitType.Auto
    };
  }

  if (text.endsWith(STAR_SUFFIX)) {
    const weight = text.slice(0, -STAR_SUFFIX.length);
    return {
      value: weight === "" ? 1 : Number(weight),
      gridUnitType: winui.GridUnitType.Star
    };
  }

  return {
    value: Number(text),
    gridUnitType: winui.GridUnitType.Pixel
  };
}

/**
 * The one place the CSS runtime touches WinUI: how a dictionary is loaded and
 * merged, a Style looked up and set on a control, a grid's definitions
 * replaced, and a control's event subscribed.
 */
export function createCssNative(winui: CssWinui) {
  const native: CssNative = {
    loadDictionary: xaml => winui.projectAs(winui.XamlReader.load(xaml), winui.ResourceDictionary),
    mergeIntoApplication(dictionary) {
      const merged = winui.Application.current.resources.mergedDictionaries;
      merged?.append(dictionary);
    },
    mergeIntoControl(control, dictionary) {
      const merged = readMember({
        target: readMember({
          target: control,
          key: "resources"
        }),
        key: "mergedDictionaries"
      });
      if (!isList(merged)) {
        throw new TypeError("not a FrameworkElement");
      }

      merged.append(dictionary);
      return () => {
        const index = merged.indexOf(dictionary);
        const isMerged = index >= 0;
        if (isMerged) {
          merged.removeAt(index);
        }
      };
    },
    lookupStyle(dictionary, key) {
      if (!isDictionary(dictionary)) {
        throw new TypeError("not a ResourceDictionary");
      }

      return winui.projectAs(dictionary.lookup(winui.PropertyValue.createString(key)), winui.Style);
    },
    // Lookup searches the merged dictionaries (WinUI's own are one); it throws
    // for a key that is in none of them.
    hasApplicationResource(key) {
      try {
        const value = winui.Application.current.resources.lookup(winui.PropertyValue.createString(key));
        return value !== null && value !== undefined;
      } catch {
        return false;
      }
    },
    setStyle(control, style) {
      Object.assign(control, { style });
    },
    setGridDefinitions(control, target, lengths) {
      const isColumns = target === "columns";
      const definitions = readMember({
        target: control,
        key: isColumns ? "columnDefinitions" : "rowDefinitions"
      });
      if (!isList(definitions)) {
        throw new TypeError(`${target} are set on a grid`);
      }

      definitions.clear();
      for (const length of lengths === "" ? [] : lengths.split(LIST_SEPARATOR)) {
        const definition = isColumns ? new winui.ColumnDefinition() : new winui.RowDefinition();
        Object.assign(definition, {
          [isColumns ? "width" : "height"]: gridLength({
            winui,
            text: length.trim()
          })
        });
        definitions.append(definition);
      }
    },
    assign(control, values) {
      Object.assign(control, values);
    },
    subscribe(control, event, handler) {
      const subscribe = readMember({
        target: control,
        key: `on${event}`
      });
      if (!isEventMethod(subscribe)) {
        return null;
      }

      const unsubscribe = subscribe.call(control, handler);
      return typeof unsubscribe === "function" ? () => unsubscribe() : null;
    },
    read: ({ control, property }) => readMember({
      target: control,
      key: property
    }),
    clip({ control, rect }) {
      const geometry = rect === null ? null : winui.projectAs(
        winui.XamlReader.load(`<RectangleGeometry ${XAML_NAMESPACES} Rect="${rect.x},${rect.y},${rect.width},${rect.height}"/>`),
        winui.RectangleGeometry
      );
      Object.assign(control, { clip: geometry });
    },
    animate({ control, storyboards, hasTransform, brushes }) {
      const restores: Array<() => void> = [];
      function replace({ property, value }: {
        property: string;
        value: object;
      }) {
        const previous = readMember({
          target: control,
          key: property
        });
        Object.assign(control, { [property]: value });
        restores.push(() => Object.assign(control, { [property]: previous }));
        return value;
      }
      const ownBrushes = new Map<string, object>();
      if (hasTransform) {
        replace({
          property: "renderTransform",
          value: new winui.CompositeTransform()
        });
      }

      for (const { property, color } of brushes) {
        const brush = winui.projectAs(winui.XamlReader.load(`<SolidColorBrush ${XAML_NAMESPACES} Color="${color}"/>`), winui.SolidColorBrush);
        ownBrushes.set(
          property, replace({
            property,
            value: brush
          })
        );
      }

      const started = storyboards.map(({ xaml, isPaused }) => {
        const storyboard = winui.projectAs(winui.XamlReader.load(xaml), winui.Storyboard);
        const timelines = Array.from({ length: storyboard.children.size }, (_, i) => storyboard.children.getAt(i));
        for (const timeline of timelines) {
          const brushPath = BRUSH_COLOR_PATH.exec(winui.Storyboard.getTargetProperty(timeline));
          const brush = ownBrushes.get(`${(brushPath?.[1] ?? "").toLowerCase()}${brushPath?.[2] ?? ""}`);
          winui.Storyboard.setTarget(timeline, brush ?? control);

          const isOwnBrush = brush !== undefined;
          if (isOwnBrush) {
            winui.Storyboard.setTargetProperty(timeline, BRUSH_COLOR);
          }
        }

        storyboard.begin();

        if (isPaused) {
          storyboard.pause();
        }

        return storyboard;
      });
      return () => {
        for (const storyboard of started) {
          storyboard.stop();
        }

        for (const restore of restores.toReversed()) {
          restore();
        }
      };
    }
  };
  return native;
}

/** The renderer's single call, after Application.create: `installCss(winui)`. */
export function installCss(winui: CssWinui) {
  installCssRuntime(createCssNative(winui));
}
