import { svelteHooks } from "#src/vite/loader.js";
import assert from "node:assert/strict";
import { registerHooks } from "node:module";
import { test } from "node:test";

// observe: state the control gives back and the app only reads.

registerHooks(svelteHooks());
const { Linker } = await import("./runtime.svelte.ts");
const { observe } = await import("./observed.ts");
const { inEffectRoot } = await import("./hand-written/overlay/overlay-test-support.svelte.ts");
const { tick } = await import("svelte");

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

// event: an app's handler, called from native code.

function silenced<Result>(action: () => Result) {
  const original = console.error;
  const written: string[] = [];
  console.error = (...parts: unknown[]) => {
    written.push(parts.map(String).join(" "));
  };
  try {
    return {
      result: action(),
      written
    };
  } finally {
    console.error = original;
  }
}

// A control with one event, raised by the test the way WinUI raises it: a sender
// that is a bare object, then the arguments.
function fakeControl() {
  const raised = new Raised();
  const control = {
    onSomething(handler: (...args: unknown[]) => void) {
      return raised.subscribe(() => handler({ isBare: true }, "args"));
    }
  };
  return {
    control,
    raised
  };
}

test("an event prop calls the app's handler with the control as sender and the event's arguments", () => {
  const link = new Linker();
  const { control, raised } = fakeControl();
  const seen: unknown[] = [];
  link.events({
    props: {
      onsomething: (...args: unknown[]) => seen.push(...args)
    },
    control,
    names: ["Something"]
  });
  raised.raise();
  assert.deepEqual(seen, [control, "args"]);
});

test("an event in raw gets what WinUI passed", () => {
  const link = new Linker();
  const { control, raised } = fakeControl();
  const seen: unknown[] = [];
  link.events({
    props: {
      onsomething: (...args: unknown[]) => seen.push(...args)
    },
    control,
    raw: ["Something"]
  });
  raised.raise();
  assert.deepEqual(seen, [{ isBare: true }, "args"]);
});

test("an event handler that throws is reported with its stack and does not reach the caller", () => {
  const link = new Linker();
  const { control, raised } = fakeControl();
  const { written } = silenced(() => {
    link.events({
      props: {
        onsomething() {
          throw new Error("handler failed");
        }
      },
      control,
      names: ["Something"]
    });
    raised.raise();
  });
  assert.equal(written.length, 1);
  assert.match(written[0] ?? "", /event "onsomething".*handler failed[\s\S]*at /u);
});

test("an event prop that was not given subscribes to nothing, and an unlinked control stops", () => {
  const link = new Linker();
  const { control, raised } = fakeControl();
  const props: { onsomething?: () => void } = {};
  link.events({
    props,
    control,
    names: ["Something"]
  });
  raised.raise();
  const stopped = new Linker();
  let calls = 0;
  stopped.events({
    props: {
      onsomething() {
        calls++;
      }
    },
    control,
    names: ["Something"]
  });
  stopped.dispose();
  raised.raise();
  assert.equal(calls, 0);
});

// A switch the user flips: the control holds its value, raises its event, and
// the app's side is a bound prop whose setter the test decides about.
function bindable({ isRefusing }: { isRefusing: boolean }) {
  const link = new Linker();
  const raised = new Raised();
  const control = { isOn: false };
  const app = { isOn: false };
  const setterCalls: boolean[] = [];
  const bound = {
    get isOn() {
      return app.isOn;
    },
    set isOn(isNext) {
      setterCalls.push(isNext);

      if (!isRefusing) {
        app.isOn = isNext;
      }
    }
  };
  inEffectRoot(() => link.bindable({
    bound,
    key: "isOn",
    access: {
      read: () => control.isOn,
      write(isNext) {
        control.isOn = isNext;
      }
    },
    subscribers: [handler => raised.subscribe(handler)]
  }));
  return {
    app,
    control,
    link,
    raised,
    setterCalls
  };
}

test("a bound prop the app accepts a change to keeps the user's value on the control", async () => {
  const { control, raised, setterCalls } = bindable({ isRefusing: false });
  control.isOn = true;
  raised.raise();
  await tick();
  assert.deepEqual(setterCalls, [true]);
  assert.equal(control.isOn, true);
});

test("a change the app refuses, by leaving the bound prop as it was, is taken back by the control", async () => {
  const { control, raised, setterCalls } = bindable({ isRefusing: true });
  control.isOn = true;
  raised.raise();
  assert.equal(control.isOn, true, "until the app has had its say, the control shows the user's value");
  await tick();
  assert.deepEqual(setterCalls, [true], "the app was told once");
  assert.equal(control.isOn, false, "the control shows what the app holds");
});

test("a refusal that arrives after the control was unlinked touches nothing", async () => {
  const { control, link, raised } = bindable({ isRefusing: true });
  control.isOn = true;
  raised.raise();
  link.dispose();
  await tick();
  assert.equal(control.isOn, true);
});
