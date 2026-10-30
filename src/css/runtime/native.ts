import type { CssNative } from "./runtime.ts";
import { installCssRuntime } from "./runtime.ts";
import { gridLengthParts, GridUnit, trackListParts } from "#src/components/values.js";
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
  projectAs<Instance extends object>(value: unknown, type: ProjectedType<Instance>): Instance;
  FrameworkElement: ProjectedType<object>;
  ColumnDefinition: new () => object;
  RowDefinition: new () => object;
  GridUnitType: {
    Auto: number;
    Pixel: number;
    Star: number;
  };
}

/* eslint-enable @typescript-eslint/naming-convention */

// A color animation names the brush of the element (`Background.(SolidColorBrush.Color)`):
// the runtime targets the element's own brush by its Color, whatever the element's type.
const BRUSH_COLOR_PATH = /^(\w)(\w*)\.\(SolidColorBrush\.Color\)$/u;
const BRUSH_COLOR = "Color";

function subscribeToEvent({ control, event, handler }: {
  control: object;
  event: string;
  handler: () => void;
}) {
  const subscribe = readMember({
    target: control,
    key: `on${event}`
  });
  if (!isEventMethod(subscribe)) {
    return null;
  }

  const unsubscribe = subscribe.call(control, handler);
  return typeof unsubscribe === "function" ? () => unsubscribe() : null;
}

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

const GRID_UNIT_NAMES = new Map<string, keyof CssWinui["GridUnitType"]>([
  [GridUnit.AUTO, "Auto"],
  [GridUnit.PIXEL, "Pixel"],
  [GridUnit.STAR, "Star"]
]);

// "Auto", "*", "2*" or pixels, as WinUI's GridLength.
function gridLength({ winui, text }: {
  winui: CssWinui;
  text: string;
}) {
  const { unit, value } = gridLengthParts(text);
  return {
    value,
    gridUnitType: winui.GridUnitType[GRID_UNIT_NAMES.get(unit) ?? "Pixel"]
  };
}

/**
 * The one place the CSS runtime touches WinUI: how a dictionary is loaded and
 * merged, a Style looked up and set on a control, a grid's definitions
 * replaced, and a control's event subscribed.
 */
export function createCssNative(winui: CssWinui) {
  // `parent` reads as a bare DependencyObject, which has no size and no Loaded or SizeChanged to listen to.
  function asFrameworkElement(parent: object) {
    try {
      return winui.projectAs(parent, winui.FrameworkElement);
    } catch {
      return parent;
    }
  }

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
    viewportOf(control) {
      const size = readMember({
        target: readMember({
          target: control,
          key: "xamlRoot"
        }),
        key: "size"
      });
      const width = readMember({
        target: size,
        key: "width"
      });
      const height = readMember({
        target: size,
        key: "height"
      });
      const isSized = typeof width === "number" && typeof height === "number";
      return isSized ? {
        width,
        height
      } : null;
    },
    // The window's XamlRoot says when it resizes, but a control has none until
    // it is in the tree: its Loaded event is the first moment to listen.
    watchViewport(control, handler) {
      const unsubscribers: Array<() => void> = [];
      function listen() {
        const root = readMember({
          target: control,
          key: "xamlRoot"
        });
        const unsubscribe = isRecord(root) ? native.subscribe(root, "Changed", handler) : null;
        const isSubscribed = unsubscribe !== null;
        if (isSubscribed) {
          unsubscribers.push(unsubscribe);
        }
      }
      listen();
      const unloaded = native.subscribe(control, "Loaded", () => {
        listen();
        handler();
      });
      const isWaiting = unloaded !== null;
      if (isWaiting) {
        unsubscribers.push(unloaded);
      }

      return () => {
        for (const unsubscribe of unsubscribers) {
          unsubscribe();
        }
      };
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
      for (const track of trackListParts(lengths)) {
        const definition = isColumns ? new winui.ColumnDefinition() : new winui.RowDefinition();
        Object.assign(definition, {
          [isColumns ? "width" : "height"]: gridLength({
            winui,
            text: track.length
          }),
          [isColumns ? "minWidth" : "minHeight"]: track.min ?? 0,
          [isColumns ? "maxWidth" : "maxHeight"]: track.max ?? Infinity
        });
        definitions.append(definition);
      }
    },
    setComposition({ control, property, value }) {
      const key = `${property.charAt(0).toLowerCase()}${property.slice(1)}`;
      const [horizontal = 0, vertical = 0, depth = 0] = value.split(",").map(Number);
      const isRotation = property === "Rotation";
      const resting = property === "Scale" ? 1 : 0;
      let isPlaced = false;
      function place(vector: {
        x: number;
        y: number;
        z: number;
      }) {
        Object.assign(control, { [key]: isRotation ? vector.x : vector });
        isPlaced = true;
      }

      const isLoaded = readMember({
        target: control,
        key: "isLoaded"
      }) === true;
      if (isLoaded) {
        place({
          x: horizontal,
          y: vertical,
          z: depth
        });
      }

      const unsubscribe = isLoaded ? null : subscribeToEvent({
        control,
        event: "Loaded",
        handler() {
          place({
            x: horizontal,
            y: vertical,
            z: depth
          });
        }
      });
      return () => {
        unsubscribe?.();

        if (isPlaced) {
          place({
            x: resting,
            y: resting,
            z: resting
          });
        }
      };
    },
    assign(control, values) {
      Object.assign(control, values);
    },
    subscribe: (control, event, handler) => subscribeToEvent({
      control,
      event,
      handler
    }),
    read({ control, property }) {
      const value = readMember({
        target: control,
        key: property
      });
      const isParent = property === "parent" && typeof value === "object" && value !== null;
      return isParent ? asFrameworkElement(value) : value;
    },
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
