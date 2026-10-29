import {
  call,
  isRecord,
  read,
  vectorOf,
  write
} from "./reflect.ts";
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
import { ColumnDefinition, Grid, RowDefinition, Run } from "#src/winui.js";

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
  // (Inline collections hold Runs, which are not UIElements.)
  placed: object[];
  // The <property> children, by the property each fills: one that goes gives
  // its property back.
  properties: Map<string, WinuiElement>;
  // Whether the element had children of its own (not <property> elements) at
  // the last sync, so taking the last of them out still empties the slot.
  hasLooseChildren: boolean;
}

type WinuiElement = ElementNode<WinuiNative>;
type PropertyElement = WinuiElement & { name: typeof PROPERTY_TAG };

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
// <property name="pane">: its children fill the parent's Pane, as XAML's
// <SplitView.Pane> does. A generated component renders its children and its
// snippet props in these.
const PROPERTY_TAG = "property";
const PROPERTY_NAME_ATTRIBUTE = "name";
// <property name="transitions" collection="transition-collection">: the tag of
// the class to make the property's collection from when it holds none, as
// WinUI leaves a panel's ChildrenTransitions null.
const PROPERTY_COLLECTION_ATTRIBUTE = "collection";
// The one collection whose text children become Runs: a text block's, a
// paragraph's and a span's.
const INLINES_PROPERTY = "inlines";
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
 * class a tag can name. A key is the class name or the tag
 * (`{ "text-block": TextBlock }`, as a component registers its own class).
 * Later calls add to earlier ones.
 *
 * @param winui - The bindings' exports, by class name or tag.
 */
export function registerControls(winui: Record<string, NativeValue>) {
  for (const [name, value] of Object.entries(winui)) {
    controls.set(kebabCase(name), value);
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
  const member = read(controls.get(kebabCase(property)), name);
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
  element.native.styled ??= styledElement({
    control,
    elementType: elementType({
      element,
      control
    })
  });
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
  call(controls.get(kebabCase(owner)), `set${pascalCase(attached)}`, control, isNumber ? Number(value) : value);
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

function isPropertyElement(node: TreeNode<WinuiNative>): node is PropertyElement {
  return node.type === NodeType.ELEMENT && node.name === PROPERTY_TAG;
}

// What a <property> element fills: its name attribute.
// `owner.property` (`tool-tip-service.tool-tip`) fills an attached property,
// as the attribute of that name does; any other is the control's own.
function propertyName(element: PropertyElement) {
  const name = element.attributes.get(PROPERTY_NAME_ATTRIBUTE);
  const isText = typeof name === "string";
  if (!isText) {
    return null;
  }

  return isAttachedName(name) ? name : camelCase(name);
}

function isAttachedName(name: string) {
  return name.includes(ATTACHED_SEPARATOR);
}

// A child of the element's own, which goes where the control's children go:
// not a <property> element, nor the comment Svelte anchors a block on, nor the
// whitespace between tags.
function isLooseChild(node: TreeNode<WinuiNative>) {
  const isText = node.type === NodeType.TEXT;
  if (isText) {
    return node.value.replaceAll(htmlWhitespaceRun, "") !== "";
  }

  return node.type === NodeType.ELEMENT && !isPropertyElement(node);
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
const controlKeys = new WeakMap<object, string>();
let nextControlKey = 0;

function keyOf(control: object) {
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

// A control can reorder (a tab strip's tabs, a tree's nodes) or drop its own
// items without telling the renderer. `placed` is put back in the collection's
// order, found through the collection's own indexOf: it compares the controls
// themselves, where a read hands back a new wrapper every time. A control the
// collection dropped has position -1, which is no array index: it is left out
// with the holes.
function resyncPlaced({ placed, collection }: {
  placed: object[];
  collection: NativeValue;
}) {
  const ordered: object[] = [];
  for (const control of placed) {
    const position = Number(call(collection, "indexOf", control));
    ordered[position] = control;
  }

  placed.splice(0, placed.length, ...ordered.filter(() => true));
}

// The native collection as keyed-list sees it, read through `placed`: a
// collection hands back a new wrapper for a control on every read.
function placedItems({ element, collection }: {
  element: WinuiElement;
  collection: NativeValue;
}) {
  const placed = element.native.placed;
  resyncPlaced({
    placed,
    collection
  });
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
  } satisfies KeyedItems<object>;
}

// A panel's children, or a ComboBox's items, are changed in place, moving as
// little as they can.
function syncCollection({ element, collection, wanted = element.children.flatMap(controlsOf) }: {
  element: WinuiElement;
  collection: NativeValue;
  wanted?: object[];
}) {
  const byKey = new Map(wanted.map(child => [keyOf(child), child]));
  syncKeyed({
    list: {
      items: placedItems({
        element,
        collection
      }),
      keyOf,
      create(key) {
        const child = byKey.get(key);
        if (!child) {
          throw new RangeError(`no control has key ${key}`);
        }

        return child;
      }
    },
    wantedKeys: [...byKey.keys()]
  });
}

function syncText({ element, control }: Omit<ElementAttributeTarget, "value">) {
  write(control, "text", textOf(element));
}

// What a panel or a decorator shows: a value object among its children (a
// storyboard, a brush) is no element, and stays with the component that made it.
function elementsOf(element: WinuiElement) {
  return element.children.flatMap(controlsOf).filter(isFrameworkElement);
}

// The properties of an element that hold elements and nothing else.
const elementProperties = new Set(["child", "children"]);

function syncChild({ element, control }: Omit<ElementAttributeTarget, "value">) {
  const [first = null] = elementsOf(element);
  write(control, "child", first);
}

// A control, or else the element's text, boxed.
function contentOf(element: WinuiElement) {
  const [first] = element.children.flatMap(controlsOf);
  const text = textOf(element);
  const textContent = text === "" ? null : boxed(text);
  return first ?? textContent;
}

function syncContent({ element, control }: Omit<ElementAttributeTarget, "value">) {
  write(control, "content", contentOf(element));
}

// The first of these properties a control has says where its children go.
// Items come before text: a ComboBox has both, and its children are its items.
const childSlots: Array<[string, ChildSlotHandler]> = [
  ["children", ({ element, control }) => syncCollection({
    element,
    collection: read(control, "children"),
    wanted: elementsOf(element)
  })],
  ["items", ({ element, control }) => syncCollection({
    element,
    collection: read(control, "items")
  })],
  ["text", syncText],
  ["child", syncChild],
  ["content", syncContent],
  // A control that is a collection itself (SwipeItems): its children are its items.
  ["insertAt", ({ element, control }) => syncCollection({
    element,
    collection: control
  })]
];

// The Run each text child of an inline collection is shown as.
const textRuns = new WeakMap<TreeNode<WinuiNative>, Run>();

function textRun({ node, text }: {
  node: TreeNode<WinuiNative>;
  text: string;
}) {
  const run = textRuns.get(node) ?? new Run();
  textRuns.set(node, run);
  const isChanged = run.text !== text;
  if (isChanged) {
    run.text = text;
  }

  return run;
}

interface InlinePart {
  node: TreeNode<WinuiNative>;
  text: string | null;
  control: UIElement | null;
}

function inlinePartsOf(child: TreeNode<WinuiNative>) {
  const isText = child.type === NodeType.TEXT;
  const parts: InlinePart[] = isText ? [{
    node: child,
    text: child.value.replaceAll(htmlWhitespaceRun, " "),
    control: null
  }] : controlsOf(child).map(control => ({
    node: child,
    text: null,
    control
  }));
  return parts;
}

// A text block's or a paragraph's inlines: its inline elements, and its text
// as Runs between them, whitespace collapsed as a browser shows it (the ends
// of the whole run trimmed, a space between a word and an element kept).
function inlinesOf(element: WinuiElement) {
  const parts = element.children.flatMap(inlinePartsOf);
  const first = parts[0];
  const last = parts.at(-1);
  return parts.flatMap<object>(({ node, text, control }) => {
    const isControl = text === null;
    if (isControl) {
      return control === null ? [] : [control];
    }

    const isFirst = node === first?.node;
    const isLast = node === last?.node;
    const trimmedStart = isFirst ? text.replace(/^ /u, "") : text;
    const trimmed = isLast ? trimmedStart.replace(/ $/u, "") : trimmedStart;
    return trimmed === "" ? [] : [textRun({
      node,
      text: trimmed
    })];
  });
}

// A property WinUI leaves null gets the collection its <property> element
// names (collection="transition-collection"), once there is something to put
// in it.
function makeCollection({ element, control, name }: {
  element: WinuiElement;
  control: UIElement;
  name: string;
}) {
  const tag = element.attributes.get(PROPERTY_COLLECTION_ATTRIBUTE);
  const hasItems = element.children.some(child => controlsOf(child).length > 0);
  const isMissing = typeof tag === "string" && hasItems && read(control, name) === null;
  if (!isMissing) {
    return;
  }

  const type = controls.get(tag);
  if (!isControlClass(type)) {
    throw new Error(`${tag} was not registered`);
  }

  write(control, name, new type());
}

// Fills the property a <property> element names on its parent's control: a
// collection with its controls (an inline collection with its text as Runs
// too), a string with its text, any other property with its first control,
// or else its text, boxed.
function syncProperty({ element, control, name }: {
  element: WinuiElement;
  control: UIElement;
  name: string;
}) {
  if (isAttachedName(name)) {
    applyAttached({
      control,
      name,
      value: contentOf(element)
    });
    return;
  }

  makeCollection({
    element,
    control,
    name
  });
  const current = read(control, name);
  const collection = vectorOf(current);
  const isElementSlot = isFrameworkElement(control) && elementProperties.has(name);
  const isCollection = collection !== null;
  if (isCollection) {
    const isInlines = name === INLINES_PROPERTY;
    const children = isElementSlot ? elementsOf(element) : element.children.flatMap(controlsOf);
    syncCollection({
      element,
      collection,
      wanted: isInlines ? inlinesOf(element) : children
    });
    return;
  }

  const isText = typeof current === "string";
  if (isText) {
    write(control, name, textOf(element));
    return;
  }

  write(control, name, isElementSlot ? elementsOf(element)[0] ?? null : contentOf(element));
}

// Takes out what a <property> element that is gone put in: its controls from
// a collection, or the value of any other property.
function clearProperty({ element, control, name }: {
  element: WinuiElement;
  control: UIElement;
  name: string;
}) {
  if (isAttachedName(name)) {
    applyAttached({
      control,
      name,
      value: null
    });
    return;
  }

  const current = read(control, name);
  const collection = vectorOf(current);
  const isValue = collection === null;
  if (isValue) {
    write(control, name, typeof current === "string" ? "" : null);
    return;
  }

  for (const placed of element.native.placed) {
    call(collection, "removeAt", Number(call(collection, "indexOf", placed)));
  }

  element.native.placed = [];
}

// The <property> children of an element, each filling its property; one
// that is gone, or now names another, gives its property back.
function syncProperties({ element, control }: Omit<ElementAttributeTarget, "value">) {
  const current = new Map<string, WinuiElement>();
  for (const child of element.children.filter(isPropertyElement)) {
    const name = propertyName(child);
    const isNamed = name !== null;
    if (isNamed) {
      current.set(name, child);
    }
  }

  for (const [name, previous] of element.native.properties) {
    const isGone = current.get(name) !== previous;
    if (isGone) {
      clearProperty({
        element: previous,
        control,
        name
      });
    }
  }

  element.native.properties = current;
  for (const [name, child] of current) {
    syncProperty({
      element: child,
      control,
      name
    });
  }
}

// Brings the native control's children in line with the tree. A <property>
// element's children fill its parent's property; an element's own children go
// in the first of childSlots its control has, when it has some or just had
// (a generated component's element holds only <property> elements, so a
// property the app set is never emptied for want of children).
function sync(element: WinuiElement) {
  if (isPropertyElement(element)) {
    syncParent(element);
    return;
  }

  const control = element.native.control;
  if (!control) {
    return;
  }

  const hasLooseChildren = element.children.some(isLooseChild);
  const isSlotChanged = hasLooseChildren || element.native.hasLooseChildren;
  element.native.hasLooseChildren = hasLooseChildren;

  if (isSlotChanged) {
    childSlots.find(([property]) => property in control)?.[1]({
      element,
      control
    });
  }

  syncProperties({
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
  // <host> holds a control made elsewhere, <property> fills its parent's: no
  // control of their own.
  const isControlless = name === HOST_TAG || name === PROPERTY_TAG;
  if (isControlless) {
    return {
      control: null,
      styled: null,
      placed: [],
      properties: new Map(),
      hasLooseChildren: false
    };
  }

  const type = controls.get(kebabCase(name));
  if (!isControlClass(type)) {
    throw new Error(`<${name}> is not a WinUI control registerControls was given`);
  }

  return {
    control: new type(),
    styled: null,
    placed: [],
    properties: new Map(),
    hasLooseChildren: false
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
    } else if (isPropertyElement(element)) {
      syncParent(element);
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
    } else if (isPropertyElement(element)) {
      syncParent(element);
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
