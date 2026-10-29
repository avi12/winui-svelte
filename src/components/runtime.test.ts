import { svelteHooks } from "#src/vite/loader.js";
import assert from "node:assert/strict";
import { registerHooks } from "node:module";
import path from "node:path";
import { test } from "node:test";

// observe: state the control gives back and the app only reads.

registerHooks(svelteHooks(path.join(import.meta.dirname, "runtime.svelte.ts")));
const { Linker } = await import("./runtime.svelte.ts");
const { observe } = await import("./observed.ts");

interface Bound {
  canGoBack?: boolean | undefined;
}

// A control's event, subscribed to by handler and raised by the test.
class Raised {
  private readonly handlers = new Set<() => void>();

  subscribe(handler: () => void) {
    this.handlers.add(handler);
    return () => this.handlers.delete(handler);
  }

  raise() {
    for (const handler of this.handlers) {
      handler();
    }
  }
}

function observed() {
  const link = new Linker();
  const raised = new Raised();
  const bound: Bound = {};
  const state = { canGoBack: false };
  observe({
    link,
    bound,
    key: "canGoBack",
    read: () => state.canGoBack,
    subscribers: [handler => raised.subscribe(handler)]
  });
  return {
    link,
    raised,
    bound,
    state
  };
}

test("an observed property holds the control's value as soon as it is linked", () => {
  const { bound } = observed();
  assert.equal(bound.canGoBack, false);
});

test("an observed property follows the control each time its event is raised", () => {
  const { bound, state, raised } = observed();
  state.canGoBack = true;
  assert.equal(bound.canGoBack, false, "nothing changes until the control says it did");
  raised.raise();
  assert.equal(bound.canGoBack, true);
});

test("an observed property stops following when the control is unlinked", () => {
  const { link, bound, state, raised } = observed();
  link.dispose();
  state.canGoBack = true;
  raised.raise();
  assert.equal(bound.canGoBack, false);
});
