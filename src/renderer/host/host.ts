import { call, isRecord, read, write } from "./reflect.ts";
import {
  autoLength,
  boxed,
  pixelLength,
  starLength,
  thickness
} from "./values.ts";
import type { StyledElement } from "#src/css/index.js";
import { styledElement } from "#src/css/index.js";
import type { NativeValue } from "#src/native-value.js";
import type { KeyedItems } from "#src/renderer/list/keyed-list.js";
import { syncKeyed } from "#src/renderer/list/keyed-list.js";
import type { GridLength } from "#src/renderer/tree/markup.js";
import {
  camelCase,
  gridLength,
  GridUnit,
  isNumeric,
  kebabCase,
  pascalCase,
  splitList,
  thicknessSides,
  WORD_SEPARATOR
} from "#src/renderer/tree/markup.js";
import type { ElementNode, FragmentNode, NativeHost, TreeNode } from "#src/renderer/tree/tree.js";
import { createTreeRenderer, NodeType, parentElement } from "#src/renderer/tree/tree.js";
import type { FrameworkElement, UIElement } from "#src/winui.js";
import { ColumnDefinition, Grid, RowDefinition } from "#src/winui.js";

// Svelte's custom renderer for WinUI: a .svelte component's elements are
// WinUI's own controls, named in kebab case (<stack-panel>, <text-block>), so
// the window keeps native controls, Windows' light and dark and the acrylic
// backdrop. The tree itself is tree.ts; here each element's native children
// follow it (a panel's children, a border's child, a button's content, a text
// block's text).
//
//   class="card-title"          the classes the component's <style> rules match
//                               (css/), after the app's class handler has
//                               seen the string (an app with Styles of its own)
//   style="margin: 4px"         inline declarations, style:name={value} merged
//   vertical-alignment="Center" a property; a quoted value becomes the
//                               property's enum, number, flag or Thickness
//   On-content="On"            a property whose name starts with "on"
//                               (ToggleSwitch.OnContent): Svelte takes a
//                               lower-case "on" for an event, so it is
//                               spelled with a capital, or on-content={() =>
//                               "On"} (see applyPropertyNamedOn)
//   grid.column={1}             an attached property: Grid.setColumn
//   columns="Auto,*,Auto"       a grid's columns (rows= its rows)
//   ontoggled={handler}         an event: onToggled
//   <host element={control} />  a control made elsewhere, placed here
//   {@attach control(...)}      the element's control, handed to code
//                               (control.ts)

interface WinuiNative {
  control: UIElement | null;
  // Made when the element first gets a class or a style.
  styled: StyledElement | null;
  // What the native collection holds, in order, to change it in place.
  placed: UIElement[];
}

type WinuiElement = ElementNode<WinuiNative>;

interface AttributeTarget {
  control: UIElement;
  name: string;
  value: NativeValue;
}

interface ElementAttributeTarget {
  element: WinuiElement;
  control: UIElement;
  value: NativeValue;
}

interface TextToConvert {
  text: string;
  property: string;
}

interface Replacement {
  previous: FrameworkElement;
  next: FrameworkElement;
}

type AttributeHandler = (target: AttributeTarget) => void;
type ElementAttributeHandler = (target: ElementAttributeTarget) => void;
type TextConverter = (conversion: TextToConvert) => NativeValue;
type ChildSlotHandler = (target: Omit<ElementAttributeTarget, "value">) => void;
type ParentSlotHandler = (placement: Replacement & { parent: object }) => void;

/**
 * What an app with Styles of its own makes of `class="..."`, before the
 * component's `<style>` rules see the same string.
 */
export type ClassHandler = (control: UIElement, value: string) => void;

const HOST_TAG = "host";
const HOST_ATTRIBUTE = "element";
const CLASS_ATTRIBUTE = "class";
const INLINE_STYLE_ATTRIBUTE = "style";
const ATTACHED_SEPARATOR = ".";
const thicknessProperties = new Set(["margin", "padding", "borderThickness"]);
// The classes and enums a tag, an enum-valued attribute or an attached
// property may name, by their WinUI names; the app registers its bindings.
const controls = new Map<string, NativeValue>();
let classHandler: ClassHandler | null = null;
const gridLengths = new Map<GridUnit, (length: GridLength) => object>([
  [GridUnit.AUTO, () => autoLength()],
  [GridUnit.PIXEL, length => pixelLength(length.value)],
  [GridUnit.STAR, length => starLength(length.value)]
]);

/**
 * Tells the renderer which WinUI classes and enums markup may name. `winui` is
 * the app's one import site of the bindings: every export it has becomes a
 * class a tag can name. Later calls add to earlier ones.
 *
 * @param winui - The bindings' exports, by name.
 */
export function registerControls(winui: Record<string, NativeValue>) {
  for (const [name, value] of Object.entries(winui)) {
    controls.set(name, value);
  }
}

/**
 * Sets what an app with Styles of its own does with each `class="..."` value,
 * before the component's `<style>` rules see it.
 *
 * @param handler - The app's handler, or `null` to remove it.
 */
export function setClassHandler(handler: ClassHandler | null) {
  classHandler = handler;
}

function isControlClass(value: NativeValue): value is new () => UIElement {
  return typeof value === "function" && "prototype" in value;
}

function isControl(value: NativeValue): value is UIElement {
  return isRecord(value);
}

function isFrameworkElement(value: NativeValue): value is FrameworkElement {
  return isRecord(value) && "margin" in value;
}

function nativeLength(text: string) {
  const length = gridLength(text);
  return gridLengths.get(length.unit)?.(length);
}

function nativeThickness(text: string) {
  return thickness(thicknessSides(text));
}

function enumMember({ property, name }: {
  property: string;
  name: string;
}) {
  const typeName = pascalCase(property);
  const member = read(controls.get(typeName), name);
  const isMemberMissing = member === undefined;
  if (isMemberMissing) {
    throw new Error(`${property}="${name}" names no ${typeName} (or registerControls was not given it)`);
  }

  return member;
}

function numberOrMember({ text, property }: TextToConvert) {
  return isNumeric(text) ? Number(text) : enumMember({
    property,
    name: text
  });
}

// By the type the property holds now. An object property such as a button's
// content takes a boxed string.
const textConverters = new Map<string, TextConverter>([
  ["boolean", ({ text }) => text === "true"],
  ["string", ({ text }) => text],
  ["number", numberOrMember]
]);

function boxedText({ text }: TextToConvert) {
  return boxed(text);
}

// A quoted value as the type the property holds now: an enum member by name,
// a number, a flag or a Thickness.
function convert({ control, property, value }: {
  control: UIElement;
  property: string;
  value: NativeValue;
}) {
  const isText = typeof value === "string";
  if (!isText) {
    return value;
  }

  if (thicknessProperties.has(property)) {
    return nativeThickness(value);
  }

  const converter = textConverters.get(typeof read(control, property)) ?? boxedText;
  return converter({
    text: value,
    property
  });
}

// `<host>` has no type of its own: the control placed there names it.
function elementType({ element, control }: {
  element: WinuiElement;
  control: UIElement;
}) {
  const isHost = element.name === HOST_TAG;
  return isHost ? kebabCase(control.constructor.name) : element.name;
}

function stylingOf({ element, control }: {
  element: WinuiElement;
  control: UIElement;
}) {
  element.native.styled ??= styledElement(
    control, elementType({
      element,
      control
    })
  );
  return element.native.styled;
}

function applyClass({ element, control, value }: ElementAttributeTarget) {
  const classNames = String(value ?? "");
  classHandler?.(control, classNames);
  const isStyled = element.native.styled !== null || classNames.trim() !== "";
  if (isStyled) {
    stylingOf({
      element,
      control
    }).setClasses(classNames);
  }
}

// Svelte hands over the whole style attribute, style:name={value}
// directives merged into it.
function applyInlineStyle({ element, control, value }: ElementAttributeTarget) {
  const isRemoved = value === null || value === undefined;
  const isUnstyled = isRemoved && element.native.styled === null;
  if (isUnstyled) {
    return;
  }

  stylingOf({
    element,
    control
  }).setInlineStyle(isRemoved ? null : String(value));
}

function disposeStyling(element: WinuiElement) {
  element.native.styled?.dispose();
  element.native.styled = null;
}

// A grid's columns or rows, each length a new definition; set again, they
// replace the ones before.
function definitionsHandler({ type, collectionName, sizeName }: {
  type: new () => object;
  collectionName: string;
  sizeName: string;
}) {
  return (({ control, value }) => {
    const collection = read(control, collectionName);
    call(collection, "clear");
    for (const length of splitList(String(value))) {
      const definition = new type();
      write(definition, sizeName, nativeLength(length));
      call(collection, "append", definition);
    }
  }) satisfies AttributeHandler;
}

function applyAttached({ control, name, value }: AttributeTarget) {
  const [owner = "", attached = ""] = name.split(ATTACHED_SEPARATOR);
  const isNumber = typeof value === "string" && isNumeric(value);
  call(controls.get(pascalCase(owner)), `set${pascalCase(attached)}`, control, isNumber ? Number(value) : value);
}

function applyProperty({ control, name, value }: AttributeTarget) {
  const property = camelCase(name);
  write(
    control, property, convert({
      control,
      property,
      value
    })
  );
}

const elementAttributes = new Map<string, ElementAttributeHandler>([
  [CLASS_ATTRIBUTE, applyClass],
  [INLINE_STYLE_ATTRIBUTE, applyInlineStyle]
]);

const namedAttributes = new Map<string, AttributeHandler>([
  ["columns", definitionsHandler({
    type: ColumnDefinition,
    collectionName: "columnDefinitions",
    sizeName: "width"
  })],
  ["rows", definitionsHandler({
    type: RowDefinition,
    collectionName: "rowDefinitions",
    sizeName: "height"
  })]
]);

function attributeHandler(name: string) {
  return namedAttributes.get(name) ?? (name.includes(ATTACHED_SEPARATOR) ? applyAttached : applyProperty);
}

function applyAttribute({ element, name, value }: {
  element: WinuiElement;
  name: string;
  value: NativeValue;
}) {
  const control = element.native.control;
  if (!control) {
    return;
  }

  const elementAttribute = elementAttributes.get(name);
  if (elementAttribute) {
    elementAttribute({
      element,
      control,
      value
    });
  } else {
    attributeHandler(name)({
      control,
      name,
      value
    });
  }
}

function controlsOf(node: TreeNode<WinuiNative>) {
  const control = node.type === NodeType.ELEMENT ? node.native.control : null;
  return control === null ? [] : [control];
}

// HTML's white-space: normal. Svelte keeps a text node's line breaks and
// indentation, which a browser collapses and WinUI would draw.
const htmlWhitespaceRun = /[ \t\n\r\f]+/gu;

// An element's text as a browser would show it: whitespace runs collapsed to
// one space and the ends trimmed. A no-break space is kept, as in HTML.
function textOf(element: WinuiElement) {
  const raw = element.children.map(child => child.type === NodeType.TEXT ? child.value : "").join("");
  return raw.replaceAll(htmlWhitespaceRun, " ").replace(/^ | $/gu, "");
}

// Each control's key in the panels it is placed in.
const controlKeys = new WeakMap<UIElement, string>();
let nextControlKey = 0;

function keyOf(control: UIElement) {
  const existing = controlKeys.get(control);
  const isKeyed = existing !== undefined;
  if (isKeyed) {
    return existing;
  }

  const key = String(nextControlKey);
  nextControlKey++;
  controlKeys.set(control, key);
  return key;
}

// The native collection as keyed-list sees it, read through `placed`: a
// collection hands back a new wrapper for a control on every read.
function placedItems({ element, collection }: {
  element: WinuiElement;
  collection: NativeValue;
}) {
  const placed = element.native.placed;
  return {
    get size() {
      return placed.length;
    },
    getAt(index) {
      const control = placed[index];
      if (!control) {
        throw new RangeError(`nothing is placed at ${index}`);
      }

      return control;
    },
    removeAt(index) {
      call(collection, "removeAt", index);
      placed.splice(index, 1);
    },
    insertAt(index, control) {
      call(collection, "insertAt", index, control);
      placed.splice(index, 0, control);
    }
  } satisfies KeyedItems<UIElement>;
}

// A panel's children, or a ComboBox's items, are changed in place, moving as
// little as they can.
function syncCollection({ element, control, collectionName }: {
  element: WinuiElement;
  control: UIElement;
  collectionName: string;
}) {
  const wanted = element.children.flatMap(controlsOf);
  const byKey = new Map(wanted.map(child => [keyOf(child), child]));
  syncKeyed({
    items: placedItems({
      element,
      collection: read(control, collectionName)
    }),
    keyOf,
    create(key) {
      const child = byKey.get(key);
      if (!child) {
        throw new RangeError(`no control has key ${key}`);
      }

      return child;
    }
  }, [...byKey.keys()]);
}

function syncText({ element, control }: Omit<ElementAttributeTarget, "value">) {
  write(control, "text", textOf(element));
}

function syncChild({ element, control }: Omit<ElementAttributeTarget, "value">) {
  const [first = null] = element.children.flatMap(controlsOf);
  write(control, "child", first);
}

// A control, or else the element's text, boxed.
function syncContent({ element, control }: Omit<ElementAttributeTarget, "value">) {
  const [first] = element.children.flatMap(controlsOf);
  const text = textOf(element);
  const textContent = text === "" ? null : boxed(text);
  write(control, "content", first ?? textContent);
}

// The first of these properties a control has says where its children go.
// Items come before text: a ComboBox has both, and its children are its items.
const childSlots: Array<[string, ChildSlotHandler]> = [
  ["children", ({ element, control }) => syncCollection({
    element,
    control,
    collectionName: "children"
  })],
  ["items", ({ element, control }) => syncCollection({
    element,
    control,
    collectionName: "items"
  })],
  ["text", syncText],
  ["child", syncChild],
  ["content", syncContent]
];

// Brings the native control's children in line with the tree.
function sync(element: WinuiElement) {
  const control = element.native.control;
  if (!control) {
    return;
  }

  const slot = childSlots.find(([property]) => property in control);
  slot?.[1]({
    element,
    control
  });
}

function syncParent(element: WinuiElement) {
  const parent = parentElement(element);
  if (parent) {
    sync(parent);
  }
}

// The event a lower-case name (Svelte's ontoggled) stands for: onToggled.
function eventMethod({ control, type }: {
  control: UIElement;
  type: string;
}) {
  const wanted = `on${type}`.toLowerCase();
  for (let prototype: NativeValue = control; isRecord(prototype); prototype = Object.getPrototypeOf(prototype)) {
    const name = Object.getOwnPropertyNames(prototype).find(key => key.toLowerCase() === wanted);
    const isEventFound = name !== undefined;
    if (isEventFound) {
      return name;
    }
  }

  throw new Error(`a ${control.constructor.name} has no ${type} event`);
}

// A property whose name starts with "on" (ToggleSwitch.OnContent) on a raw
// element. Svelte takes every attribute starting with "on" for an event: the
// quoted form is a compile error, and `on-content={value}` hands the host a
// wrapper that calls `value` as a handler and keeps nothing it returns. An
// inline function is handed over as it is, so `on-content={() => "On"}` is
// the form that works, read once when the element is made. A property that
// changes is set through {@attach control(...)}, as components do.
function applyPropertyNamedOn({ control, type, thunk }: {
  control: UIElement;
  type: string;
  thunk: NativeValue;
}) {
  const name = `on${type}`;
  const guidance = `${name} on a raw element must be an inline function returning the value: ${name}={() => value}`;
  if (!isThunk(thunk)) {
    throw new TypeError(guidance);
  }

  const value = valueOf({
    thunk,
    guidance
  });
  const isValueMissing = value === undefined;
  if (isValueMissing) {
    throw new TypeError(guidance);
  }

  applyProperty({
    control,
    name,
    value
  });
}

function isThunk(value: NativeValue): value is () => NativeValue {
  return typeof value === "function";
}

function valueOf({ thunk, guidance }: {
  thunk: () => NativeValue;
  guidance: string;
}) {
  try {
    return thunk();
  } catch (error) {
    throw new TypeError(guidance, { cause: error });
  }
}

// Which <host> placed each control, so a hot-swapped component's new root
// can take the old one's place with the same attributes.
const hostOf = new WeakMap<UIElement, WinuiElement>();

function hostControl({ element, control }: {
  element: WinuiElement;
  control: NativeValue;
}) {
  // The styling belongs to the control it was made for.
  disposeStyling(element);
  const hostedControl = isControl(control) ? control : null;
  element.native.control = hostedControl;

  if (hostedControl) {
    hostOf.set(hostedControl, element);
  }
}

function placeHost({ element, control }: {
  element: WinuiElement;
  control: NativeValue;
}) {
  hostControl({
    element,
    control
  });
  for (const [name, value] of element.attributes) {
    const isHostAttribute = name === HOST_ATTRIBUTE;
    if (!isHostAttribute) {
      applyAttribute({
        element,
        name,
        value
      });
    }
  }

  syncParent(element);
}

// A removed subtree is discarded, but a control placed in it from elsewhere
// (<host>) lives on and may be placed again, as a hot-swapped component does
// at once: it is taken out of the discarded control that holds it, which
// WinUI would otherwise refuse (already the child of another element).
function releaseHosts(node: TreeNode<WinuiNative>) {
  const isElement = node.type === NodeType.ELEMENT;
  if (!isElement) {
    return;
  }

  const isHostNode = node.name === HOST_TAG;
  if (isHostNode) {
    disposeStyling(node);
    node.native.control = null;
    syncParent(node);
    return;
  }

  for (const child of node.children) {
    releaseHosts(child);
  }
}

// Nothing in a removed subtree may keep its controls alive: the tree nodes
// hold them, and an event subscription is held by the control itself.
function forgetControls(node: TreeNode<WinuiNative>) {
  const isElement = node.type === NodeType.ELEMENT;
  if (!isElement) {
    return;
  }

  for (const child of node.children) {
    forgetControls(child);
  }

  for (const subscriptions of node.listeners.values()) {
    for (const unsubscribe of subscriptions.values()) {
      unsubscribe();
    }
  }

  node.listeners.clear();
  disposeStyling(node);
  node.native.control = null;
  node.native.placed.length = 0;
}

// Hosted controls first: they must leave the discarded controls that hold
// them before those are forgotten.
function release(node: TreeNode<WinuiNative>) {
  releaseHosts(node);
  forgetControls(node);
}

function createNative(name: string) {
  const isHost = name === HOST_TAG;
  if (isHost) {
    return {
      control: null,
      styled: null,
      placed: []
    };
  }

  const type = controls.get(pascalCase(name));
  if (!isControlClass(type)) {
    throw new Error(`<${name}> is not a WinUI control registerControls was given`);
  }

  return {
    control: new type(),
    styled: null,
    placed: []
  };
}

const winuiHost: NativeHost<WinuiNative> = {
  create: createNative,
  setAttribute(element, name, value) {
    const isHostAttribute = name === HOST_ATTRIBUTE;
    if (isHostAttribute) {
      placeHost({
        element,
        control: value
      });
    } else {
      applyAttribute({
        element,
        name,
        value
      });
    }
  },
  removeAttribute(element, name) {
    const isHostAttribute = name === HOST_ATTRIBUTE;
    if (isHostAttribute) {
      placeHost({
        element,
        control: null
      });
    } else if (elementAttributes.has(name)) {
      applyAttribute({
        element,
        name,
        value: null
      });
    }
  },
  childrenChanged: sync,
  fragmentChanged(fragment) {
    rootWatchers.get(fragment)?.(firstControl(fragment));
  },
  removed: release,
  listen(element, type, handler) {
    const control = element.native.control;
    return control === null ? null : subscribe({
      control,
      type,
      handler
    });
  }
};

// What ends the subscription, or null for a handler that is not one.
function subscribe({ control, type, handler }: {
  control: UIElement;
  type: string;
  handler: NativeValue;
}) {
  const isPropertyNamedOn = type.startsWith(WORD_SEPARATOR);
  if (isPropertyNamedOn) {
    applyPropertyNamedOn({
      control,
      type,
      thunk: handler
    });
    return null;
  }

  const isHandler = typeof handler === "function";
  if (!isHandler) {
    return null;
  }

  const unsubscribe = call(
    control, eventMethod({
      control,
      type
    }), handler
  );
  return typeof unsubscribe === "function" ? () => unsubscribe() : null;
}

const renderer = createTreeRenderer(winuiHost);

/**
 * Lets go of what a mounted component's nodes hold, after Svelte's unmount,
 * and stops watching the mount target.
 *
 * @param fragment - The mount target the component was built in.
 */
export function releaseFragment(fragment: FragmentNode<WinuiNative>) {
  for (const node of fragment.children.splice(0)) {
    node.parent = null;
    release(node);
  }

  unwatchRoot(fragment);
}

function firstControl(parent: FragmentNode<WinuiNative> | WinuiElement) {
  return parent.children.flatMap(controlsOf).find(isFrameworkElement) ?? null;
}

/**
 * The control a mounted component made first: its root.
 *
 * @param parent - The mount target, or an element, whose children hold the component.
 * @returns The first control among them.
 * @throws {Error} When the component made no control.
 */
export function rootControl(parent: FragmentNode<WinuiNative> | WinuiElement) {
  const control = firstControl(parent);
  if (!control) {
    throw new Error("the component made no control");
  }

  return control;
}

// Told the mount target's first control each time its children change.
const rootWatchers = new WeakMap<FragmentNode<WinuiNative>, (control: FrameworkElement | null) => void>();

/**
 * Starts telling `onChange` the mount target's first control, each time its
 * children change.
 *
 * @param options - The mount target, and who to tell.
 */
export function watchRoot({ fragment, onChange }: {
  fragment: FragmentNode<WinuiNative>;
  onChange: (control: FrameworkElement | null) => void;
}) {
  rootWatchers.set(fragment, onChange);
}

/**
 * Stops telling anyone about a mount target's children.
 *
 * @param fragment - The mount target.
 */
export function unwatchRoot(fragment: FragmentNode<WinuiNative>) {
  rootWatchers.delete(fragment);
}

const gridPlacements = ["Row", "Column", "RowSpan", "ColumnSpan"];

function replaceInCollection({ collection, previous, next }: Replacement & { collection: NativeValue }) {
  const index = Number(call(collection, "indexOf", previous));
  call(collection, "removeAt", index);
  call(collection, "insertAt", index, next);
}

// Where a control placed by code sits in its parent: a panel's children, a
// border's child or a content control's content.
const parentSlots: Array<[string, ParentSlotHandler]> = [
  ["children", ({ parent, previous, next }) => replaceInCollection({
    collection: read(parent, "children"),
    previous,
    next
  })],
  ["child", ({ parent, next }) => write(parent, "child", next)],
  ["content", ({ parent, next }) => write(parent, "content", next)]
];

function replaceInParent({ previous, next }: Replacement) {
  const parent = read(previous, "parent");
  if (!isRecord(parent)) {
    return;
  }

  const slot = parentSlots.find(([property]) => property in parent);
  if (!slot) {
    return;
  }

  for (const placement of gridPlacements) {
    call(Grid, `set${placement}`, next, call(Grid, `get${placement}`, previous));
  }

  slot[1]({
    parent,
    previous,
    next
  });
}

/**
 * Puts `next` where `previous` is: through the `<host>` that placed it, with
 * that host's attributes, or else in its parent control, keeping its place in
 * a grid.
 *
 * @param replacement - The control to take out, and the one to put in its place.
 */
export function swapControl({ previous, next }: Replacement) {
  const host = hostOf.get(previous);
  if (!host) {
    replaceInParent({
      previous,
      next
    });
  } else {
    placeHost({
      element: host,
      control: next
    });
  }
}

// Svelte's compiled components import the renderer module's default export:
// the one place a default export is not ours to choose.
// eslint-disable-next-line no-restricted-exports -- Svelte's customRenderer option imports the default export
export default renderer;
