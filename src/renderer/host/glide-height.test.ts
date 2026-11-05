import { glideHeight } from "./glide-height.ts";
import assert from "node:assert/strict";
import { test } from "node:test";

// glideHeight on a stand-in element and node: the control reports sizes the
// test sets, and the node's animate() records what it was asked.

interface Asked {
  keyframes: Array<Record<string, string>>;
  duration: number | undefined;
  finish(): void;
  cancel(): void;
  isCancelled: boolean;
}

function setUp(startHeight: number) {
  const listeners = new Set<() => void>();
  const control = {
    actualHeight: startHeight,
    onSizeChanged(listener: () => void) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    }
  };
  const asked: Asked[] = [];
  const node = {
    native: {
      control
    },
    animate(keyframes: Array<Record<string, string>>, options: {
      duration?: number;
    }) {
      const glide: {
        onfinish: (() => void) | null;
        oncancel: (() => void) | null;
        cancel(): void;
      } = {
        onfinish: null,
        oncancel: null,
        cancel() {
          request.isCancelled = true;
          glide.oncancel?.();
        }
      };
      const request: Asked = {
        keyframes,
        duration: options.duration,
        finish: () => glide.onfinish?.(),
        cancel: () => glide.cancel(),
        isCancelled: false
      };
      asked.push(request);
      return glide;
    }
  };
  return {
    asked,
    node,
    resize(height: number) {
      control.actualHeight = height;
      for (const listener of listeners) {
        listener();
      }
    },
    isListening: () => listeners.size > 0
  };
}

test("a size change glides the height from the old size to the new", () => {
  const { asked, node, resize } = setUp(100);
  glideHeight({ duration: 150 })(node);

  resize(160);
  assert.equal(asked.length, 1);
  assert.deepEqual(asked[0]?.keyframes, [{ height: "100px" }, { height: "160px" }]);
  assert.equal(asked[0]?.duration, 150);
});

test("the first layout does not glide", () => {
  const { asked, node, resize } = setUp(0);
  glideHeight()(node);

  resize(120);
  assert.equal(asked.length, 0);
});

test("sizes the glide itself causes are ignored, and a change during it is picked up after", () => {
  const { asked, node, resize } = setUp(100);
  glideHeight()(node);

  resize(160);
  resize(130);
  resize(200);
  assert.equal(asked.length, 1, "no new glide while one runs");

  asked[0]?.finish();
  assert.equal(asked.length, 2, "the end looks again at the height the layout settled on");
  assert.deepEqual(asked[1]?.keyframes, [{ height: "160px" }, { height: "200px" }]);
});

test("a glide that ends where the layout is leaves nothing more to do", () => {
  const { asked, node, resize } = setUp(100);
  glideHeight()(node);

  resize(160);
  resize(160);
  asked[0]?.finish();
  assert.equal(asked.length, 1);
});

test("removing the element stops listening and cancels the glide", () => {
  const { asked, node, resize, isListening } = setUp(100);
  const stop = glideHeight()(node);

  resize(160);
  assert.equal(typeof stop, "function");
  stop?.();
  assert.equal(isListening(), false);
  assert.equal(asked[0]?.isCancelled, true);
  assert.equal(asked.length, 1, "cancelling does not start another glide");
});

test("without element animation it says what to call", () => {
  const { node } = setUp(100);
  const bare = {
    native: node.native
  };
  assert.throws(() => glideHeight()(bare), /enableElementAnimation/u);
});
