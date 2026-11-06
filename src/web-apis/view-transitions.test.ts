import { installViewTransitions } from "./view-transitions.ts";
import type { TransitionAnimation, TransitionAnimationService, ViewTransition } from "./view-transitions.ts";
import { nameForTransition } from "#src/renderer/host/view-transition-names.js";
import type {
  ConnectedAnimationConfiguration
} from "#winui/microsoft/ui/xaml/media/animation/ConnectedAnimationConfiguration";
import type { UIElement } from "#winui/microsoft/ui/xaml/UIElement";
import assert from "node:assert/strict";
import { test } from "node:test";

// `document.startViewTransition` over a stand-in for WinUI's connected
// animation service; the names are given the way the CSS group gives them.

interface FakeControl {
  readonly label: string;
}

function control(label: string) {
  return {
    label,
    transformToVisual() {},
    onLayoutUpdated() {},
    onLoaded() {},
    onUnloaded() {}
  };
}

function labelOf(element: UIElement) {
  // oxlint-disable-next-line typescript/consistent-type-assertions -- the stand-ins are FakeControls
  return (element as unknown as FakeControl).label;
}

class FakeAnimation implements TransitionAnimation {
  // oxlint-disable-next-line typescript/consistent-type-assertions -- never read by the transition
  configuration = {} as unknown as ConnectedAnimationConfiguration;
  readonly source: string;
  destination: string | null = null;
  isCancelled = false;
  private completed: (() => void) | null = null;

  constructor(source: string) {
    this.source = source;
  }

  tryStart(destination: UIElement) {
    this.destination = labelOf(destination);
    return true;
  }

  cancel() {
    this.isCancelled = true;
  }

  onceCompleted(callback: () => void) {
    this.completed = callback;
    return () => undefined;
  }

  complete() {
    this.completed?.();
  }
}

class FakeService implements TransitionAnimationService {
  readonly animations = new Map<string, FakeAnimation>();

  // eslint-disable-next-line no-restricted-syntax -- the service's own signature
  prepareToAnimate(key: string, source: UIElement) {
    this.animations.set(key, new FakeAnimation(labelOf(source)));
  }

  getAnimation(key: string) {
    return this.animations.get(key) ?? null;
  }
}

interface DocumentWithTransitions {
  startViewTransition(input?: unknown): ViewTransition;
}

function isDocumentWithTransitions(value: unknown): value is DocumentWithTransitions {
  return typeof value === "object" && value !== null && "startViewTransition" in value;
}

function setUp() {
  const service = new FakeService();
  const uninstall = installViewTransitions({
    connectedAnimations: service,
    settle: () => Promise.resolve()
  });
  const { document } = globalThis;
  if (!isDocumentWithTransitions(document)) {
    throw new Error("installViewTransitions defined no document.startViewTransition");
  }

  return {
    service,
    document,
    uninstall
  };
}

test("the element named before the update flies to the one named alike after it", async () => {
  const { service, document, uninstall } = setUp();
  const unnameThumbnail = nameForTransition({
    control: control("thumbnail"),
    name: "photo-3"
  });
  const unnames = [unnameThumbnail];
  try {
    const transition = document.startViewTransition(() => {
      unnameThumbnail();
      unnames.push(
        nameForTransition({
          control: control("hero"),
          name: "photo-3"
        })
      );
    });
    await transition.updateCallbackDone;
    await transition.ready;
    const animation = service.animations.get("photo-3");
    assert.ok(animation);
    assert.equal(animation.source, "thumbnail");
    assert.equal(animation.destination, "hero");
    animation.complete();
    await transition.finished;
  } finally {
    for (const unname of unnames) {
      unname();
    }

    uninstall();
  }
});

test("the options object carries the update and the types", async () => {
  const { document, uninstall } = setUp();
  try {
    let hasUpdated = false;
    const transition = document.startViewTransition({
      update() {
        hasUpdated = true;
      },
      types: ["forward"]
    });
    await transition.finished;
    assert.equal(hasUpdated, true);
    assert.deepEqual([...transition.types], ["forward"]);
  } finally {
    uninstall();
  }
});

test("skipping rejects ready, still runs the update and cancels what was prepared", async () => {
  const { service, document, uninstall } = setUp();
  const unname = nameForTransition({
    control: control("card"),
    name: "card"
  });
  try {
    let hasUpdated = false;
    const transition = document.startViewTransition(() => {
      hasUpdated = true;
    });
    transition.skipTransition();
    await assert.rejects(transition.ready, { name: "AbortError" });
    await transition.finished;
    assert.equal(hasUpdated, true);
    assert.equal(service.animations.get("card")?.isCancelled, true);
  } finally {
    unname();
    uninstall();
  }
});

test("an update that throws rejects every promise with its error", async () => {
  const { document, uninstall } = setUp();
  try {
    const failure = new Error("no detail page");
    const transition = document.startViewTransition(() => {
      throw failure;
    });
    await assert.rejects(transition.updateCallbackDone, failure);
    await assert.rejects(transition.ready, failure);
    await assert.rejects(transition.finished, failure);
  } finally {
    uninstall();
  }
});

test("two elements with one name skip the transition with an InvalidStateError", async () => {
  const { service, document, uninstall } = setUp();
  const unnames = [
    nameForTransition({
      control: control("first"),
      name: "twin"
    }),
    nameForTransition({
      control: control("second"),
      name: "twin"
    })
  ];
  try {
    const transition = document.startViewTransition(() => undefined);
    await assert.rejects(transition.ready, { name: "InvalidStateError" });
    await transition.finished;
    assert.equal(service.animations.size, 0);
  } finally {
    for (const unname of unnames) {
      unname();
    }

    uninstall();
  }
});

test("a name only the old state has starts nothing and lets its animation go", async () => {
  const { service, document, uninstall } = setUp();
  const unname = nameForTransition({
    control: control("leaving"),
    name: "leaving"
  });
  try {
    const transition = document.startViewTransition(() => unname());
    await transition.ready;
    await transition.finished;
    const animation = service.animations.get("leaving");
    assert.ok(animation);
    assert.equal(animation.destination, null);
    assert.equal(animation.isCancelled, true);
  } finally {
    unname();
    uninstall();
  }
});

test("a new transition skips the one still running", async () => {
  const { document, uninstall } = setUp();
  try {
    const first = document.startViewTransition(() => undefined);
    const second = document.startViewTransition(() => undefined);
    await assert.rejects(first.ready, { name: "AbortError" });
    await second.finished;
  } finally {
    uninstall();
  }
});

test("uninstalling takes the document it defined away again", () => {
  const hasDocument = "document" in globalThis;
  const { uninstall } = setUp();
  uninstall();
  assert.equal("document" in globalThis, hasDocument);
});
