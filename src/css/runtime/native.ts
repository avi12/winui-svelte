import type { CssNative } from "./runtime.ts";
import { installCssRuntime } from "./runtime.ts";
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

const LIST_SEPARATOR = ",";
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
  return isRecord(value) && typeof value["append"] === "function" && typeof value["clear"] === "function";
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
