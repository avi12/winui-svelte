import { createTreeRenderer } from "#src/renderer/tree/tree.js";
import assert from "node:assert/strict";
import { test } from "node:test";

// The three observers over stand-in controls and a real (platform-less) tree,
// with the deferred work run by hand: sizes, intersections with the window, an
// effective viewport and a root, and the tree's children, attributes and text.

const {
  installObservers,
  IntersectionObserver,
  MutationObserver,
  ResizeObserver
} = await import("./observers.ts");

const WINDOW_WIDTH = 800;
const WINDOW_HEIGHT = 600;
const SCALE = 1.5;
const SQUARE = 100;
const HALF = 0.5;

class FakeControl {
  actualWidth = 0;
  actualHeight = 0;
  origin = {
    x: 0,
    y: 0
  };
  readonly xamlRoot = {
    rasterizationScale: SCALE,
    size: {
      width: WINDOW_WIDTH,
      height: WINDOW_HEIGHT
    },
    onChanged: (listener: () => void) => {
      this.rootListeners.add(listener);
      return () => this.rootListeners.delete(listener);
    }
  };
  private readonly sizeListeners = new Set<() => void>();
  private readonly rootListeners = new Set<() => void>();
  private readonly viewportListeners = new Set<(sender: unknown, args: {
    effectiveViewport: {
      x: number;
      y: number;
      width: number;
      height: number;
    };
  }) => void>();

  onSizeChanged(listener: () => void) {
    this.sizeListeners.add(listener);
    return () => this.sizeListeners.delete(listener);
  }

  onEffectiveViewportChanged(listener: (sender: unknown, args: {
    effectiveViewport: {
      x: number;
      y: number;
      width: number;
      height: number;
    };
  }) => void) {
    this.viewportListeners.add(listener);
    return () => this.viewportListeners.delete(listener);
  }

  transformToVisual() {
    return {
      transformBounds: (rect: {
        x: number;
        y: number;
        width: number;
        height: number;
      }) => ({
        ...rect,
        x: rect.x + this.origin.x,
        y: rect.y + this.origin.y
      })
    };
  }

  place({ x, y, width, height }: {
    x: number;
    y: number;
    width: number;
    height: number;
  }) {
    this.origin = {
      x,
      y
    };
    this.actualWidth = width;
    this.actualHeight = height;
    for (const listener of this.sizeListeners) {
      listener();
    }
  }

  clipTo(effectiveViewport: {
    x: number;
    y: number;
    width: number;
    height: number;
  }) {
    for (const listener of this.viewportListeners) {
      listener(this, { effectiveViewport });
    }
  }

  get listenerCount() {
    return this.sizeListeners.size + this.viewportListeners.size + this.rootListeners.size;
  }
}

function element(control: FakeControl) {
  return {
    native: {
      control
    }
  };
}

function install() {
  const queue: Array<() => void> = [];
  const uninstall = installObservers({ schedule: work => queue.push(work) });
  return {
    uninstall,
    run() {
      for (const work of queue.splice(0)) {
        work();
      }
    }
  };
}

test("a ResizeObserver reports a size once it is not 0 by 0, and again when it changes", () => {
  const { uninstall, run } = install();
  const control = new FakeControl();
  const target = element(control);
  const seen: Array<[number, number, number]> = [];
  const observer = new ResizeObserver(entries => {
    for (const entry of entries) {
      assert.equal(entry.target, target);
      seen.push([entry.contentRect.width, entry.contentRect.height, entry.rasterizationScale]);
    }
  });
  observer.observe(target);
  run();
  assert.deepEqual(seen, [], "0 by 0 is not reported");
  control.place({
    x: 0,
    y: 0,
    width: 200,
    height: 50
  });
  control.place({
    x: 0,
    y: 0,
    width: 200,
    height: 50
  });
  assert.deepEqual(seen, [[200, 50, SCALE]], "the same size is not reported twice");
  observer.unobserve(target);
  control.place({
    x: 0,
    y: 0,
    width: 10,
    height: 10
  });
  assert.equal(seen.length, 1);
  assert.equal(control.listenerCount, 0);
  uninstall();
});

test("a ResizeObserver measures a size already there when it starts, and in device pixels when asked", () => {
  const { uninstall, run } = install();
  const control = new FakeControl();
  control.actualWidth = 40;
  control.actualHeight = 20;
  const sizes: number[] = [];
  const observer = new ResizeObserver(entries => {
    for (const entry of entries) {
      sizes.push(entry.devicePixelContentBoxSize[0]?.inlineSize ?? 0, entry.contentBoxSize[0]?.inlineSize ?? 0);
    }
  });
  observer.observe(element(control), { box: "device-pixel-content-box" });
  run();
  assert.deepEqual(sizes, [40 * SCALE, 40]);
  observer.disconnect();
  uninstall();
});

test("a ResizeObserver refuses a target that is not a WinUI element", () => {
  const { uninstall } = install();
  const observer = new ResizeObserver(() => undefined);
  assert.throws(() => observer.observe({}), TypeError);
  uninstall();
});

test("an IntersectionObserver reports the first state, then each threshold crossed", () => {
  const { uninstall, run } = install();
  const control = new FakeControl();
  const ratios: Array<[boolean, number]> = [];
  const observer = new IntersectionObserver(entries => {
    for (const entry of entries) {
      ratios.push([entry.isIntersecting, entry.intersectionRatio]);
    }
  }, { threshold: [0, HALF, 1] });
  control.place({
    x: 10,
    y: 10,
    width: SQUARE,
    height: SQUARE
  });
  observer.observe(element(control));
  run();
  assert.deepEqual(ratios, [[true, 1]]);
  control.place({
    x: 10,
    y: WINDOW_HEIGHT - SQUARE / 2,
    width: SQUARE,
    height: SQUARE
  });
  control.place({
    x: 10,
    y: WINDOW_HEIGHT + 10,
    width: SQUARE,
    height: SQUARE
  });
  assert.deepEqual(ratios, [[true, 1], [true, HALF], [false, 0]]);
  uninstall();
});

test("an effective viewport clips what a scrolling ancestor hides", () => {
  const { uninstall, run } = install();
  const control = new FakeControl();
  const states: boolean[] = [];
  const observer = new IntersectionObserver(entries => {
    for (const entry of entries) {
      states.push(entry.isIntersecting);
    }
  });
  control.place({
    x: 0,
    y: 0,
    width: SQUARE,
    height: SQUARE
  });
  observer.observe(element(control));
  run();
  control.clipTo({
    x: 0,
    y: SQUARE + 1,
    width: SQUARE,
    height: SQUARE
  });
  control.clipTo({
    x: 0,
    y: 0,
    width: SQUARE,
    height: SQUARE
  });
  assert.deepEqual(states, [true, false, true]);
  uninstall();
});

test("a root element and a root margin set the viewport", () => {
  const { uninstall, run } = install();
  const rootControl = new FakeControl();
  rootControl.place({
    x: 0,
    y: 0,
    width: 200,
    height: 200
  });
  const control = new FakeControl();
  control.place({
    x: 210,
    y: 0,
    width: SQUARE,
    height: SQUARE
  });
  const states: boolean[] = [];
  const observer = new IntersectionObserver(entries => {
    for (const entry of entries) {
      states.push(entry.isIntersecting);
    }
  }, {
    root: element(rootControl),
    rootMargin: "0px 20px"
  });
  observer.observe(element(control));
  run();
  assert.deepEqual(states, [true], "the margin reaches the target 10 pixels past the root");
  assert.throws(() => new IntersectionObserver(() => undefined, { rootMargin: "1em" }), { name: "SyntaxError" });
  assert.throws(() => new IntersectionObserver(() => undefined, { threshold: 2 }), RangeError);
  uninstall();
});

function createTree() {
  return createTreeRenderer<object>({
    create: () => ({}),
    setAttribute() {},
    removeAttribute() {},
    childrenChanged() {},
    fragmentChanged() {},
    removed() {},
    listen: () => null
  });
}

test("a MutationObserver sees children, attributes and text, with old values", () => {
  const { uninstall, run } = install();
  const tree = createTree();
  const parent = tree.createElement("stack-panel");
  const text = tree.createTextNode("one");
  parent.append(text);
  const records: string[] = [];
  const observer = new MutationObserver(list => {
    for (const record of list) {
      records.push(`${record.type} ${record.attributeName ?? ""} ${record.oldValue ?? ""} +${record.addedNodes.length} -${record.removedNodes.length}`);
    }
  });
  observer.observe(parent, {
    childList: true,
    attributes: true,
    characterData: true,
    subtree: true,
    attributeOldValue: true,
    characterDataOldValue: true
  });
  const child = tree.createElement("button");
  parent.appendChild(child);
  child.setAttribute("content", "A");
  child.setAttribute("content", "B");
  child.removeAttribute("content");
  text.data = "two";
  child.remove();
  assert.deepEqual(records, [], "records arrive after the event");
  run();
  assert.deepEqual(records, [
    "childList   +1 -0",
    "attributes content  +0 -0",
    "attributes content A +0 -0",
    "attributes content B +0 -0",
    "characterData  one +0 -0",
    "childList   +0 -1"
  ]);
  uninstall();
});

test("a MutationObserver keeps to what it asked for, and disconnect and takeRecords end the delivery", () => {
  const { uninstall, run } = install();
  const tree = createTree();
  const parent = tree.createElement("stack-panel");
  const child = tree.createElement("button");
  parent.append(child);
  const names: string[] = [];
  const observer = new MutationObserver(list => {
    for (const record of list) {
      names.push(`${record.target === parent ? "parent" : "child"} ${record.attributeName}`);
    }
  });
  observer.observe(parent, {
    attributes: true,
    attributeFilter: ["width"]
  });
  parent.setAttribute("width", "1");
  parent.setAttribute("height", "1");
  child.setAttribute("width", "1");
  run();
  assert.deepEqual(names, ["parent width"], "a filter, and no subtree");
  parent.setAttribute("width", "2");
  assert.equal(observer.takeRecords().length, 1);
  run();
  assert.equal(names.length, 1);
  parent.setAttribute("width", "3");
  observer.disconnect();
  run();
  assert.equal(names.length, 1);
  assert.throws(() => observer.observe(parent, {}), TypeError);
  uninstall();
});

test("uninstalling puts the tree's operations back and removes the classes", () => {
  const { uninstall } = install();
  const tree = createTree();
  const before = tree.insert;
  const parent = tree.createElement("stack-panel");
  new MutationObserver(() => undefined).observe(parent, { childList: true });
  assert.notEqual(tree.insert, before);
  uninstall();
  assert.equal(tree.insert, before);
  assert.equal(typeof globalThis.ResizeObserver, "undefined");
  assert.equal(typeof globalThis.MutationObserver, "undefined");
});
