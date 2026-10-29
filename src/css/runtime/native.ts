import type { CssNative } from "./runtime.ts";
import { installCssRuntime } from "./runtime.ts";
import { gridLengthParts, GridUnit, trackListParts } from "#src/components/values.js";
import type { BoxedValue, NativeValue } from "#src/native-value.js";

interface ProjectedType<Instance extends object> {
  readonly prototype: Instance;
}

interface DictionaryLike {
  lookup(key: BoxedValue): BoxedValue;
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
    })
  };
  return native;
}

/** The renderer's single call, after Application.create: `installCss(winui)`. */
export function installCss(winui: CssWinui) {
  installCssRuntime(createCssNative(winui));
}
