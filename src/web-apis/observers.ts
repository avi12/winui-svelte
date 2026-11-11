import { DomErrorName } from "./dom-exception.ts";
import { defineProperty } from "./install.ts";
import { sharedRectangle } from "#src/capture/region.js";
import type { NativeValue } from "#src/native-value.js";
import { isRecord, read } from "#src/renderer/host/reflect.js";
import { DomNode, NodeType } from "#src/renderer/tree/dom.js";
import type {
  CommentNode,
  ParentNode,
  TextNode,
  TreeNode,
  TreeRenderer
} from "#src/renderer/tree/dom.js";
import { dispatch } from "#src/scheduling.js";

const MAX_MARGIN_VALUES = 4;
const PERCENT = 100;
const MARGIN_VALUE = /^(-?\d+(?:\.\d+)?)(px|%)$/u;
const DEFAULT_ROOT_MARGIN = "0px";

/** A rectangle in device-independent pixels. */
export interface ObservedBox {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

/** What `EffectiveViewportChanged` carries: the visible part of the viewport, in the element's coordinates. */
export interface ViewportChange {
  readonly effectiveViewport: ObservedBox;
}

/**
 * What the observers need of a WinUI element: a `FrameworkElement` has all of
 * it. An observed target is the tree's element (what `bind:this` and
 * `@attach` give) or the control itself.
 */
export interface ObservedControl {
  readonly actualWidth: number;
  readonly actualHeight: number;
  onSizeChanged(listener: () => void): () => void;
  onEffectiveViewportChanged?(listener: (sender: unknown, args: ViewportChange) => void): () => void;
  transformToVisual?(visual: object | null): { transformBounds(rect: ObservedBox): ObservedBox };
  readonly xamlRoot?: {
    readonly rasterizationScale: number;
    readonly size: {
      readonly width: number;
      readonly height: number;
    };
    onChanged(listener: () => void): () => void;
  } | null;
}

/** What `installObservers` takes. */
export interface ObserversInstallOptions {
  /** Runs work after the current event: default, the UI thread's dispatcher; the tests run it by hand. */
  readonly schedule?: (work: () => void) => void;
}

interface ObserversContext {
  readonly schedule: (work: () => void) => void;
  readonly hooked: Map<TreeRenderer<unknown>, () => void>;
  readonly mutationObservers: Set<MutationObserver>;
}

let context: ObserversContext | undefined;

function requireContext() {
  if (!context) {
    throw new DOMException("the observers are not installed: call installObservers() first", "InvalidStateError");
  }

  return context;
}

function isObservedControl(value: NativeValue): value is ObservedControl {
  return isRecord(value) && typeof value["actualWidth"] === "number" && typeof value["onSizeChanged"] === "function";
}

function controlOf(target: object) {
  const control = read(read(target, "native"), "control");
  const candidate = control ?? target;
  const isControl = isObservedControl(candidate);
  if (!isControl) {
    throw new TypeError("the target is not a WinUI element: pass an element of the tree or its control");
  }

  return candidate;
}

function emptyBox() {
  return {
    x: 0,
    y: 0,
    width: 0,
    height: 0
  };
}

function rectangleOf(box: ObservedBox) {
  return {
    ...box,
    top: box.y,
    left: box.x,
    right: box.x + box.width,
    bottom: box.y + box.height
  };
}

/** A rectangle with its edges, as `DOMRectReadOnly`. */
export type ObservedRectangle = ReturnType<typeof rectangleOf>;

function intersect({ first, second }: {
  first: ObservedBox;
  second: ObservedBox;
}) {
  const shared = sharedRectangle({
    first,
    second
  });
  const isEmpty = shared.width < 0 || shared.height < 0;
  return isEmpty ? null : shared;
}

/** The boxes `ResizeObserver.observe` can be told to report. */
export const ResizeObserverBox = {
  CONTENT: "content-box",
  BORDER: "border-box",
  DEVICE_PIXEL_CONTENT: "device-pixel-content-box"
} as const;
/** One of the values of `ResizeObserverBox`. */
export type ResizeObserverBox = (typeof ResizeObserverBox)[keyof typeof ResizeObserverBox];

/** The options of `ResizeObserver.observe`. */
export interface ResizeObserverOptions {
  readonly box?: ResizeObserverBox;
}

/** One size, as `ResizeObserverSize`. */
export interface ResizeObserverSize {
  readonly inlineSize: number;
  readonly blockSize: number;
}

/** What a `ResizeObserver` reports about one element. */
export class ResizeObserverEntry {
  readonly target: object;
  readonly contentRect: ObservedRectangle;
  readonly contentBoxSize: readonly ResizeObserverSize[];
  readonly borderBoxSize: readonly ResizeObserverSize[];
  readonly devicePixelContentBoxSize: readonly ResizeObserverSize[];

  /** WinUI only: device pixels per device-independent pixel when the size was read (`XamlRoot.RasterizationScale`). */
  readonly rasterizationScale: number;

  constructor(init: {
    target: object;
    width: number;
    height: number;
    scale: number;
  }) {
    const { width, height, scale } = init;
    this.target = init.target;
    this.contentRect = rectangleOf({
      x: 0,
      y: 0,
      width,
      height
    });
    this.contentBoxSize = [{
      inlineSize: width,
      blockSize: height
    }];
    this.borderBoxSize = this.contentBoxSize;
    this.devicePixelContentBoxSize = [{
      inlineSize: Math.round(width * scale),
      blockSize: Math.round(height * scale)
    }];
    this.rasterizationScale = scale;
  }
}

interface ResizeObservation {
  readonly target: object;
  readonly control: ObservedControl;
  readonly box: ResizeObserverBox;
  readonly stop: () => void;
  width: number;
  height: number;
}

function sizeIn({ control, box }: {
  control: ObservedControl;
  box: ResizeObserverBox;
}) {
  const scale = control.xamlRoot?.rasterizationScale ?? 1;
  const isDevice = box === ResizeObserverBox.DEVICE_PIXEL_CONTENT;
  return {
    width: isDevice ? Math.round(control.actualWidth * scale) : control.actualWidth,
    height: isDevice ? Math.round(control.actualHeight * scale) : control.actualHeight,
    scale
  };
}

/** Calls back when an element's laid-out size changes: `SizeChanged` on the element's control. */
export class ResizeObserver {
  private readonly callback: (entries: ResizeObserverEntry[], observer: ResizeObserver) => void;
  private readonly observations = new Map<object, ResizeObservation>();

  constructor(callback: (entries: ResizeObserverEntry[], observer: ResizeObserver) => void) {
    requireContext();
    this.callback = callback;
  }

  /** Starts watching the element; its size is reported once as soon as it is not 0 by 0. */
  observe(target: object, options: ResizeObserverOptions = {}) {
    const control = controlOf(target);
    this.unobserve(target);
    const observation: ResizeObservation = {
      target,
      control,
      box: options.box ?? ResizeObserverBox.CONTENT,
      stop: control.onSizeChanged(() => this.check(observation)),
      width: 0,
      height: 0
    };
    this.observations.set(target, observation);
    requireContext().schedule(() => {
      const isStillObserved = this.observations.get(target) === observation;
      if (isStillObserved) {
        this.check(observation);
      }
    });
  }

  /** Stops watching the element. */
  unobserve(target: object) {
    this.observations.get(target)?.stop();
    this.observations.delete(target);
  }

  /** Stops watching every element. */
  disconnect() {
    for (const target of this.observations.keys()) {
      this.unobserve(target);
    }
  }

  private check(observation: ResizeObservation) {
    const { width, height, scale } = sizeIn(observation);
    const isSame = width === observation.width && height === observation.height;
    if (isSame) {
      return;
    }

    observation.width = width;
    observation.height = height;
    const control = observation.control;
    this.callback([
      new ResizeObserverEntry({
        target: observation.target,
        width: control.actualWidth,
        height: control.actualHeight,
        scale
      })
    ], this);
  }
}

/** The options of `new IntersectionObserver(callback, options)`. */
export interface IntersectionObserverInit {
  readonly root?: object | null;
  readonly rootMargin?: string;
  readonly threshold?: number | readonly number[];
}

/** What an `IntersectionObserver` reports about one element. */
export class IntersectionObserverEntry {
  readonly time: number;
  readonly target: object;
  readonly rootBounds: ObservedRectangle | null;
  readonly boundingClientRect: ObservedRectangle;
  readonly intersectionRect: ObservedRectangle;
  readonly isIntersecting: boolean;
  readonly intersectionRatio: number;

  constructor(init: {
    time: number;
    target: object;
    rootBounds: ObservedBox | null;
    boundingClientRect: ObservedBox;
    intersectionRect: ObservedBox;
    isIntersecting: boolean;
    intersectionRatio: number;
  }) {
    this.time = init.time;
    this.target = init.target;
    this.rootBounds = init.rootBounds === null ? null : rectangleOf(init.rootBounds);
    this.boundingClientRect = rectangleOf(init.boundingClientRect);
    this.intersectionRect = rectangleOf(init.intersectionRect);
    this.isIntersecting = init.isIntersecting;
    this.intersectionRatio = init.intersectionRatio;
  }
}

interface IntersectionObservation {
  readonly target: object;
  readonly control: ObservedControl;
  readonly stops: Array<() => void>;
  viewport: ObservedBox | null;
  previousIndex: number;
  previousIsIntersecting: boolean;
}

function parseMargin(text: string) {
  const parts = text.trim().split(/\s+/u);
  const values = parts.map(part => MARGIN_VALUE.exec(part));
  const isInvalid = parts.length > MAX_MARGIN_VALUES || values.some(match => match === null);
  if (isInvalid) {
    throw new DOMException(`"${text}" is not a root margin: use up to four lengths in px or %`, DomErrorName.SYNTAX);
  }

  const [top, right = top, bottom = top, left = right] = values.map(match => ({
    amount: Number(match?.[1]),
    isPercent: match?.[2] === "%"
  }));
  return {
    top,
    right,
    bottom,
    left
  };
}

function marginLength({ side, extent }: {
  side: {
    amount: number;
    isPercent: boolean;
  } | undefined;
  extent: number;
}) {
  const isUnset = side === undefined;
  if (isUnset) {
    return 0;
  }

  return side.isPercent ? side.amount * extent / PERCENT : side.amount;
}

function grow({ box, margin }: {
  box: ObservedBox;
  margin: ReturnType<typeof parseMargin>;
}) {
  const top = marginLength({
    side: margin.top,
    extent: box.height
  });
  const right = marginLength({
    side: margin.right,
    extent: box.width
  });
  const bottom = marginLength({
    side: margin.bottom,
    extent: box.height
  });
  const left = marginLength({
    side: margin.left,
    extent: box.width
  });
  return {
    x: box.x - left,
    y: box.y - top,
    width: box.width + left + right,
    height: box.height + top + bottom
  };
}

function thresholdsOf(threshold: number | readonly number[] | undefined) {
  const list = [threshold ?? 0].flat();
  const isInvalid = list.some(value => !(value >= 0 && value <= 1));
  if (isInvalid) {
    throw new RangeError("a threshold is a number from 0 to 1");
  }

  return list.toSorted((first, second) => first - second);
}

function windowBoundsOf(control: ObservedControl) {
  const size = control.xamlRoot?.size;
  return size === undefined ? emptyBox() : {
    x: 0,
    y: 0,
    width: size.width,
    height: size.height
  };
}

function boundsIn({ control, within }: {
  control: ObservedControl;
  within: ObservedControl | null;
}) {
  const box = {
    x: 0,
    y: 0,
    width: control.actualWidth,
    height: control.actualHeight
  };
  return control.transformToVisual?.(within)?.transformBounds(box) ?? box;
}

/** Calls back when an element enters or leaves a viewport: the window, its scrolling ancestors or a `root` element. */
export class IntersectionObserver {
  readonly root: object | null;
  readonly rootMargin: string;
  readonly thresholds: readonly number[];
  private readonly callback: (entries: IntersectionObserverEntry[], observer: IntersectionObserver) => void;
  private readonly observations = new Map<object, IntersectionObservation>();
  private readonly margin: ReturnType<typeof parseMargin>;
  private records: IntersectionObserverEntry[] = [];

  constructor(
    callback: (entries: IntersectionObserverEntry[], observer: IntersectionObserver) => void,
    init: IntersectionObserverInit = {}
  ) {
    requireContext();
    this.callback = callback;
    this.root = init.root ?? null;
    this.rootMargin = init.rootMargin ?? DEFAULT_ROOT_MARGIN;
    this.margin = parseMargin(this.rootMargin);
    this.thresholds = thresholdsOf(init.threshold);
  }

  /** Starts watching the element; its state is reported once as soon as it is measured. */
  observe(target: object) {
    const control = controlOf(target);
    this.unobserve(target);
    const observation: IntersectionObservation = {
      target,
      control,
      stops: [],
      viewport: null,
      previousIndex: -1,
      previousIsIntersecting: false
    };
    const remeasure = () => this.check(observation);
    observation.stops.push(control.onSizeChanged(remeasure));
    const stopViewport = control.onEffectiveViewportChanged?.((_sender, args) => {
      observation.viewport = args.effectiveViewport;
      remeasure();
    });
    const stopRoot = this.rootControl()?.onSizeChanged(remeasure);
    const stopWindow = control.xamlRoot?.onChanged(remeasure);
    for (const stop of [stopViewport, stopRoot, stopWindow]) {
      const hasStop = stop !== undefined;
      if (hasStop) {
        observation.stops.push(stop);
      }
    }

    this.observations.set(target, observation);
    requireContext().schedule(() => {
      const isStillObserved = this.observations.get(target) === observation;
      if (isStillObserved) {
        remeasure();
      }
    });
  }

  /** Stops watching the element. */
  unobserve(target: object) {
    for (const stop of this.observations.get(target)?.stops ?? []) {
      stop();
    }

    this.observations.delete(target);
    this.records = this.records.filter(record => record.target !== target);
  }

  /** Stops watching every element. */
  disconnect() {
    for (const target of this.observations.keys()) {
      this.unobserve(target);
    }
  }

  /** Takes the entries not yet delivered. */
  takeRecords() {
    const taken = this.records;
    this.records = [];
    return taken;
  }

  private rootControl() {
    return this.root === null ? null : controlOf(this.root);
  }

  private check(observation: IntersectionObservation) {
    const { control } = observation;
    const rootControl = this.rootControl();
    const target = boundsIn({
      control,
      within: null
    });
    const rootBounds = grow({
      box: rootControl === null ? windowBoundsOf(control) : boundsIn({
        control: rootControl,
        within: null
      }),
      margin: this.margin
    });
    const visible = this.visibleOf({
      observation,
      target,
      rootBounds
    });
    const intersection = visible ?? {
      x: target.x,
      y: target.y,
      width: 0,
      height: 0
    };
    const area = target.width * target.height;
    const isIntersecting = visible !== null;
    const isMeasurable = isIntersecting && area > 0;
    const ratio = isMeasurable ? intersection.width * intersection.height / area : Number(isIntersecting);
    const index = isIntersecting ? this.thresholds.filter(value => value <= ratio).length : 0;
    const isUnchanged = index === observation.previousIndex && isIntersecting === observation.previousIsIntersecting;
    if (isUnchanged) {
      return;
    }

    observation.previousIndex = index;
    observation.previousIsIntersecting = isIntersecting;
    this.records.push(
      new IntersectionObserverEntry({
        time: performance.now(),
        target: observation.target,
        rootBounds,
        boundingClientRect: target,
        intersectionRect: intersection,
        isIntersecting,
        intersectionRatio: ratio
      })
    );
    this.deliver();
  }

  private visibleOf({ observation, target, rootBounds }: {
    observation: IntersectionObservation;
    target: ObservedBox;
    rootBounds: ObservedBox;
  }) {
    const inRoot = intersect({
      first: target,
      second: rootBounds
    });
    const { viewport } = observation;
    const isClippedByViewport = this.root === null && viewport !== null && inRoot !== null;
    if (!isClippedByViewport) {
      return inRoot;
    }

    return intersect({
      first: inRoot,
      second: {
        x: target.x + viewport.x,
        y: target.y + viewport.y,
        width: viewport.width,
        height: viewport.height
      }
    });
  }

  private deliver() {
    const entries = this.takeRecords();
    const hasEntries = entries.length > 0;
    if (hasEntries) {
      this.callback(entries, this);
    }
  }
}

/** The kinds of change a `MutationRecord` is about. */
export const MutationRecordType = {
  ATTRIBUTES: "attributes",
  CHARACTER_DATA: "characterData",
  CHILD_LIST: "childList"
} as const;
/** One of the values of `MutationRecordType`. */
export type MutationRecordType = (typeof MutationRecordType)[keyof typeof MutationRecordType];

/** The options of `MutationObserver.observe`. */
export interface MutationObserverInit {
  readonly childList?: boolean;
  readonly attributes?: boolean;
  readonly characterData?: boolean;
  readonly subtree?: boolean;
  readonly attributeOldValue?: boolean;
  readonly characterDataOldValue?: boolean;
  readonly attributeFilter?: readonly string[];
}

/** One change to the tree, as `MutationRecord`. */
export interface MutationRecord {
  readonly type: MutationRecordType;
  readonly target: object;
  readonly addedNodes: readonly object[];
  readonly removedNodes: readonly object[];
  readonly previousSibling: object | null;
  readonly nextSibling: object | null;
  readonly attributeName: string | null;
  readonly attributeNamespace: null;
  readonly oldValue: string | null;
}

interface MutationRegistration {
  readonly node: object;
  readonly init: MutationObserverInit;
}

function recordOf(changes: Partial<MutationRecord> & Pick<MutationRecord, "type" | "target">) {
  return {
    addedNodes: [],
    removedNodes: [],
    previousSibling: null,
    nextSibling: null,
    attributeName: null,
    attributeNamespace: null,
    oldValue: null,
    ...changes
  } satisfies MutationRecord;
}

function isTreeNode(value: object): value is DomNode<unknown> {
  return value instanceof DomNode;
}

function siblingsAround({ parent, anchor }: {
  parent: ParentNode<unknown>;
  anchor: TreeNode<unknown> | null;
}) {
  const children = parent.children;
  const iAnchor = anchor === null ? children.length : children.indexOf(anchor);
  return {
    previousSibling: children[iAnchor - 1] ?? null,
    nextSibling: anchor
  };
}

function announce(record: MutationRecord) {
  for (const observer of requireContext().mutationObservers) {
    observer.collect(record);
  }
}

function hookRenderer(renderer: TreeRenderer<unknown>) {
  const known = requireContext().hooked;
  const isHooked = known.has(renderer);
  if (isHooked) {
    return;
  }

  const original = {
    insert: renderer.insert,
    remove: renderer.remove,
    clear: renderer.clear,
    setAttribute: renderer.setAttribute,
    removeAttribute: renderer.removeAttribute,
    setText: renderer.setText
  };
  function detach(node: TreeNode<unknown>) {
    const { parent } = node;
    const isLoose = parent === null;
    if (isLoose) {
      return;
    }

    const iNode = parent.children.indexOf(node);
    announce(
      recordOf({
        type: MutationRecordType.CHILD_LIST,
        target: parent,
        removedNodes: [node],
        previousSibling: parent.children[iNode - 1] ?? null,
        nextSibling: parent.children[iNode + 1] ?? null
      })
    );
  }
  renderer.insert = (parent, node, anchor) => {
    const isFragment = node.type === NodeType.FRAGMENT;
    const added = isFragment ? [...node.children] : [node];
    if (!isFragment) {
      detach(node);
    }

    const around = siblingsAround({
      parent,
      anchor
    });
    original.insert(parent, node, anchor);
    announce(
      recordOf({
        type: MutationRecordType.CHILD_LIST,
        target: parent,
        addedNodes: added,
        ...around
      })
    );
  };
  renderer.remove = node => {
    detach(node);
    original.remove(node);
  };
  renderer.clear = parent => {
    const removedNodes = [...parent.children];
    original.clear(parent);
    const hasRemoved = removedNodes.length > 0;
    if (hasRemoved) {
      announce(
        recordOf({
          type: MutationRecordType.CHILD_LIST,
          target: parent,
          removedNodes
        })
      );
    }
  };
  renderer.setAttribute = (element, name, value) => {
    const oldValue = element.getAttribute(name);
    original.setAttribute(element, name, value);
    announce(
      recordOf({
        type: MutationRecordType.ATTRIBUTES,
        target: element,
        attributeName: name,
        oldValue
      })
    );
  };
  renderer.removeAttribute = (element, name) => {
    const oldValue = element.getAttribute(name);
    original.removeAttribute(element, name);
    announce(
      recordOf({
        type: MutationRecordType.ATTRIBUTES,
        target: element,
        attributeName: name,
        oldValue
      })
    );
  };
  renderer.setText = (node: TextNode<unknown> | CommentNode<unknown>, text) => {
    const oldValue = node.value;
    original.setText(node, text);
    announce(
      recordOf({
        type: MutationRecordType.CHARACTER_DATA,
        target: node,
        oldValue
      })
    );
  };
  known.set(renderer, () => Object.assign(renderer, original));
}

function isWithin({ node, ancestor }: {
  node: object;
  ancestor: object;
}) {
  let current: object | null = node;
  while (current !== null) {
    const isAncestor = current === ancestor;
    if (isAncestor) {
      return true;
    }

    current = isTreeNode(current) ? current.parent : null;
  }

  return false;
}

function listens({ init, record }: {
  init: MutationObserverInit;
  record: MutationRecord;
}) {
  const isAttribute = record.type === MutationRecordType.ATTRIBUTES;
  const filter = init.attributeFilter;
  const isFiltered = isAttribute && filter !== undefined && !filter.includes(record.attributeName ?? "");
  const hasAttributeInterest = init.attributeOldValue !== undefined || filter !== undefined;
  const isWanted = {
    [MutationRecordType.ATTRIBUTES]: init.attributes ?? hasAttributeInterest,
    [MutationRecordType.CHARACTER_DATA]: init.characterData ?? init.characterDataOldValue !== undefined,
    [MutationRecordType.CHILD_LIST]: init.childList ?? false
  }[record.type];
  return isWanted && !isFiltered;
}

/** Calls back with the changes made to the tree of elements and text under a node. */
export class MutationObserver {
  private readonly callback: (records: MutationRecord[], observer: MutationObserver) => void;
  private readonly registrations: MutationRegistration[] = [];
  private records: MutationRecord[] = [];
  private isScheduled = false;

  constructor(callback: (records: MutationRecord[], observer: MutationObserver) => void) {
    requireContext();
    this.callback = callback;
  }

  /** Starts watching the node for the kinds of change `init` names. */
  observe(target: object, init: MutationObserverInit) {
    if (!isTreeNode(target)) {
      throw new TypeError("the target is not a node of the tree");
    }

    const hasNamedKind = init.childList === true || init.attributes === true || init.characterData === true;
    const hasImpliedKind = init.attributeOldValue !== undefined || init.attributeFilter !== undefined ||
      init.characterDataOldValue !== undefined;
    const hasKind = hasNamedKind || hasImpliedKind;
    if (!hasKind) {
      throw new TypeError("observe() needs childList, attributes or characterData");
    }

    hookRenderer(target.renderer);
    const index = this.registrations.findIndex(registration => registration.node === target);
    const hasPrevious = index >= 0;
    if (hasPrevious) {
      this.registrations.splice(index, 1);
    }

    this.registrations.push({
      node: target,
      init
    });
    requireContext().mutationObservers.add(this);
  }

  /** Stops watching and drops the changes not yet delivered. */
  disconnect() {
    this.registrations.length = 0;
    this.records = [];
    requireContext().mutationObservers.delete(this);
  }

  /** Takes the changes not yet delivered. */
  takeRecords() {
    const taken = this.records;
    this.records = [];
    return taken;
  }

  /** Called by the tree for every change; keeps the ones this observer watches for. */
  collect(record: MutationRecord) {
    const matching = this.registrations.find(registration => {
      const isTarget = registration.node === record.target;
      const isBelow = registration.init.subtree === true && isWithin({
        node: record.target,
        ancestor: registration.node
      });
      return (isTarget || isBelow) && listens({
        init: registration.init,
        record
      });
    });
    const isIgnored = matching === undefined;
    if (isIgnored) {
      return;
    }

    const init = matching.init;
    const isAttribute = record.type === MutationRecordType.ATTRIBUTES;
    const shouldKeepOldValue = isAttribute ? init.attributeOldValue === true : init.characterDataOldValue === true;
    this.records.push(
      shouldKeepOldValue ? record : {
        ...record,
        oldValue: null
      }
    );
    this.scheduleDelivery();
  }

  private scheduleDelivery() {
    if (this.isScheduled) {
      return;
    }

    this.isScheduled = true;
    requireContext().schedule(() => {
      this.isScheduled = false;
      const records = this.takeRecords();
      const hasRecords = records.length > 0;
      if (hasRecords) {
        this.callback(records, this);
      }
    });
  }
}

/**
 * Defines `ResizeObserver`, `IntersectionObserver` and `MutationObserver` on
 * the global scope, over the tree's WinUI elements: a size is the control's
 * `SizeChanged`, an intersection is measured against the window, the effective
 * viewport of its scrolling ancestors (`EffectiveViewportChanged`) or a
 * `root` element, and a mutation is a change to the tree the renderer keeps
 * (children, attributes and text). The target is an element of the tree (what
 * `bind:this` and `@attach` give) or a control. A browser's page
 * zoom and CSS boxes do not exist here: `border-box` and `content-box` are
 * both the control's `ActualWidth` by `ActualHeight`. Records and entries
 * arrive after the current event, on the UI thread's dispatcher.
 *
 * @param options - Where deferred work runs.
 * @returns A function that removes the three classes and the tree hooks.
 */
export function installObservers(options: ObserversInstallOptions = {}) {
  const installed: ObserversContext = {
    schedule: options.schedule ?? dispatch,
    hooked: new Map(),
    mutationObservers: new Set()
  };
  context = installed;
  const restores = [
    defineProperty({
      name: "ResizeObserver",
      value: ResizeObserver
    }),
    defineProperty({
      name: "ResizeObserverEntry",
      value: ResizeObserverEntry
    }),
    defineProperty({
      name: "IntersectionObserver",
      value: IntersectionObserver
    }),
    defineProperty({
      name: "IntersectionObserverEntry",
      value: IntersectionObserverEntry
    }),
    defineProperty({
      name: "MutationObserver",
      value: MutationObserver
    })
  ];
  return () => {
    for (const unhook of installed.hooked.values()) {
      unhook();
    }

    installed.hooked.clear();
    installed.mutationObservers.clear();
    for (const restore of restores.reverse()) {
      restore();
    }

    context = undefined;
  };
}
