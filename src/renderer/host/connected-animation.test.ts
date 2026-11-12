import { connectElement, startConnected } from "./connected-animation.ts";
import type { ConnectedAnimationHost } from "./connected-animation.ts";
import type { UIElement } from "#winui/microsoft/ui/xaml/UIElement";
import assert from "node:assert/strict";
import { test } from "node:test";

function element(name: string) {
  return { name } as unknown as UIElement;
}

class FakeHost implements ConnectedAnimationHost {
  readonly prepared = new Map<string, UIElement>();
  readonly started: UIElement[] = [];

  prepareToAnimate(key: string, source: UIElement) {
    this.prepared.set(key, source);
  }

  getAnimation(key: string) {
    const isPrepared = this.prepared.has(key);
    if (!isPrepared) {
      return null;
    }

    this.prepared.delete(key);
    return {
      tryStart: (destination: UIElement) => {
        this.started.push(destination);
        return true;
      }
    };
  }
}

test("an element prepared under a key is animated to the one that starts it", () => {
  const host = new FakeHost();
  const target = element("detail");
  connectElement({
    key: "photo",
    element: element("thumbnail"),
    host
  });
  assert.equal(
    startConnected({
      key: "photo",
      element: target,
      host
    }),
    true
  );
  assert.deepEqual(host.started, [target]);
});

test("a key nothing prepared starts nothing", () => {
  const host = new FakeHost();
  assert.equal(
    startConnected({
      key: "missing",
      element: element("detail"),
      host
    }),
    false
  );
  assert.deepEqual(host.started, []);
});

test("an animation plays once per preparation", () => {
  const host = new FakeHost();
  connectElement({
    key: "photo",
    element: element("thumbnail"),
    host
  });
  startConnected({
    key: "photo",
    element: element("a"),
    host
  });
  assert.equal(
    startConnected({
      key: "photo",
      element: element("b"),
      host
    }),
    false
  );
});
