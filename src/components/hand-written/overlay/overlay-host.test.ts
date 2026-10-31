import type { DialogControl, FlyoutControl, LoadableElement } from "./overlay-host.svelte.ts";
import type { PlacedControl } from "#src/renderer/host/control.js";
import "#src/state/test-support/svelte-runes.js";
import assert from "node:assert/strict";
import { test } from "node:test";

// The overlay host (overlay-host.svelte.ts) on stand-ins for the controls: the
// real Linker and effects, with the opening and closing WinUI does played by
// hand.

const { flushSync } = await import("svelte");
const { attachDialog, attachFlyout } = await import("./overlay-host.svelte.ts");
const { inEffectRoot, openState } = await import("./overlay-test-support.svelte.ts");

const NONE = 0;
const PRIMARY = 1;

class Handlers {
  private readonly handlers = new Set<() => void>();

  add(handler: () => void) {
    this.handlers.add(handler);
    return () => {
      this.handlers.delete(handler);
    };
  }

  fire() {
    for (const handler of this.handlers.values().toArray()) {
      handler();
    }
  }
}

class FakeAnchor implements LoadableElement<string> {
  isLoaded: boolean;
  readonly xamlRoot: string;
  private readonly loaded = new Handlers();

  constructor({ name, isLoaded = true }: {
    name: string;
    isLoaded?: boolean;
  }) {
    this.xamlRoot = `root of ${name}`;
    this.isLoaded = isLoaded;
  }

  onceLoaded(handler: () => void) {
    return this.loaded.add(handler);
  }

  load() {
    this.isLoaded = true;
    this.loaded.fire();
  }
}

class FakeFlyout implements FlyoutControl {
  isOpen = false;
  hidden = 0;
  shownAt: LoadableElement<unknown> | null = null;
  private readonly opened = new Handlers();
  private readonly closed = new Handlers();

  showAt(target: LoadableElement<unknown>) {
    this.shownAt = target;
    this.isOpen = true;
    this.opened.fire();
  }

  hide() {
    this.hidden++;
    this.isOpen = false;
    this.closed.fire();
  }

  onOpened(handler: () => void) {
    return this.opened.add(handler);
  }

  onClosed(handler: () => void) {
    return this.closed.add(handler);
  }
}

class FakeDialog implements DialogControl<string, number> {
  xamlRoot = "";
  shown = 0;
  hidden = 0;
  private readonly opened = new Handlers();
  private pending = Promise.withResolvers<number>();

  showAsync() {
    this.shown++;
    this.pending = Promise.withResolvers<number>();
    queueMicrotask(() => this.opened.fire());
    return this.pending.promise;
  }

  hide() {
    this.hidden++;
    this.answer(NONE);
  }

  answer(result: number) {
    this.pending.resolve(result);
  }

  onOpened(handler: () => void) {
    return this.opened.add(handler);
  }
}

function placedIn<Control extends object>({ control, parent }: {
  control: Control;
  parent: object | null;
}) {
  return {
    control,
    parent: () => parent
  } satisfies PlacedControl<Control>;
}

function settle() {
  return new Promise(resolve => setImmediate(resolve));
}

function flyoutIn(anchor: FakeAnchor) {
  const flyout = new FakeFlyout();
  const state = openState();
  const props: { target?: LoadableElement<unknown> } = {};
  const { result: link, stop: stopEffects } = inEffectRoot(() => attachFlyout({
    placed: placedIn({
      control: flyout,
      parent: anchor
    }),
    props,
    bound: state
  }));
  return {
    flyout,
    state,
    props,
    stop() {
      link?.dispose();
      stopEffects();
    }
  };
}

test("a flyout opens next to the element it is written in when open turns true, and closes when it turns false", () => {
  const anchor = new FakeAnchor({ name: "button" });
  const { flyout, state, stop } = flyoutIn(anchor);
  assert.equal(flyout.isOpen, false, "open that was never set opens nothing");

  state.open = true;
  flushSync();
  assert.equal(flyout.shownAt, anchor);
  assert.equal(flyout.isOpen, true);

  state.open = false;
  flushSync();
  assert.equal(flyout.isOpen, false);
  stop();
});

test("a flyout the user closes sets open back to false, and one that opens by itself sets it to true", () => {
  const anchor = new FakeAnchor({ name: "button" });
  const { flyout, state, stop } = flyoutIn(anchor);
  state.open = true;
  flushSync();

  flyout.hide();
  assert.equal(state.open, false, "light dismiss reached open");

  flyout.showAt(anchor);
  assert.equal(state.open, true, "a click on the button that owns it reached open");
  stop();
});

test("open turning true while the flyout is already open leaves it open: a button that opens its own flyout on click", () => {
  const anchor = new FakeAnchor({ name: "button" });
  const { flyout, state, stop } = flyoutIn(anchor);
  // The button opened its flyout before the Opened event reached open.
  flyout.isOpen = true;

  state.open = true;
  flushSync();
  assert.equal(flyout.hidden, 0, "the flyout was closed and opened again");
  assert.equal(flyout.isOpen, true);
  assert.equal(state.open, true);
  stop();
});

test("target wins over the element the flyout is written in", () => {
  const written = new FakeAnchor({ name: "button" });
  const chosen = new FakeAnchor({ name: "other" });
  const { flyout, state, props, stop } = flyoutIn(written);
  props.target = chosen;
  state.open = true;
  flushSync();
  assert.equal(flyout.shownAt, chosen);
  stop();
});

test("a flyout asked to open before its element loads opens when it loads, and not at all when closed first", () => {
  const anchor = new FakeAnchor({
    name: "button",
    isLoaded: false
  });
  const { flyout, state, stop } = flyoutIn(anchor);
  state.open = true;
  flushSync();
  assert.equal(flyout.isOpen, false);

  anchor.load();
  assert.equal(flyout.isOpen, true);
  stop();

  const late = new FakeAnchor({
    name: "late",
    isLoaded: false
  });
  const withdrawn = flyoutIn(late);
  withdrawn.state.open = true;
  flushSync();
  withdrawn.state.open = false;
  flushSync();
  late.load();
  assert.equal(withdrawn.flyout.isOpen, false, "the wait ended with the ask");
  withdrawn.stop();
});

test("a flyout that is open closes with its component", () => {
  const { flyout, state, stop } = flyoutIn(new FakeAnchor({ name: "button" }));
  state.open = true;
  flushSync();
  stop();
  assert.equal(flyout.isOpen, false);
});

function dialogIn(anchor: FakeAnchor) {
  const dialog = new FakeDialog();
  const state = openState();
  const results: number[] = [];
  const { result: link, stop: stopEffects } = inEffectRoot(() => attachDialog({
    placed: placedIn({
      control: dialog,
      parent: anchor
    }),
    props: {
      onresult: result => results.push(result)
    },
    bound: state
  }));
  return {
    dialog,
    state,
    results,
    stop() {
      link?.dispose();
      stopEffects();
    }
  };
}

test("a dialog shows in its element's window, answers onresult and sets open back to false", async () => {
  const anchor = new FakeAnchor({ name: "panel" });
  const { dialog, state, results, stop } = dialogIn(anchor);
  state.open = true;
  flushSync();
  assert.equal(dialog.shown, 1);
  assert.equal(dialog.xamlRoot, anchor.xamlRoot);

  dialog.answer(PRIMARY);
  await settle();
  flushSync();
  assert.deepEqual(results, [PRIMARY]);
  assert.equal(state.open, false, "the user's choice reached open");
  stop();
});

test("a dialog asked for while another is open waits for it, and opens in order", async () => {
  const anchor = new FakeAnchor({ name: "panel" });
  const first = dialogIn(anchor);
  const second = dialogIn(anchor);
  first.state.open = true;
  second.state.open = true;
  flushSync();
  assert.equal(first.dialog.shown, 1);
  assert.equal(second.dialog.shown, 0, "WinUI would refuse a second ShowAsync");
  assert.equal(second.state.open, true, "open stays what the app asked for while it waits");

  first.dialog.answer(PRIMARY);
  await settle();
  flushSync();
  assert.equal(second.dialog.shown, 1);
  assert.equal(first.state.open, false);
  second.dialog.answer(NONE);
  await settle();
  first.stop();
  second.stop();
});

test("a dialog closed by the app while it waits is never shown and answers nothing", async () => {
  const anchor = new FakeAnchor({ name: "panel" });
  const first = dialogIn(anchor);
  const second = dialogIn(anchor);
  first.state.open = true;
  second.state.open = true;
  flushSync();
  second.state.open = false;
  flushSync();
  first.dialog.answer(PRIMARY);
  await settle();
  assert.equal(second.dialog.shown, 0);
  assert.deepEqual(second.results, []);
  first.stop();
  second.stop();
});

test("a dialog closed by the app while it shows is hidden and answers None", async () => {
  const { dialog, state, results, stop } = dialogIn(new FakeAnchor({ name: "panel" }));
  state.open = true;
  flushSync();
  await settle();
  state.open = false;
  flushSync();
  await settle();
  assert.equal(dialog.hidden, 1);
  assert.deepEqual(results, [NONE]);
  assert.equal(state.open, false);
  stop();
});

test("open turned true again while the dialog still closes shows it again after it", async () => {
  const { dialog, state, stop } = dialogIn(new FakeAnchor({ name: "panel" }));
  state.open = true;
  flushSync();
  state.open = false;
  flushSync();
  state.open = true;
  flushSync();
  await settle();
  flushSync();
  assert.equal(dialog.shown, 2);
  assert.equal(state.open, true, "the second ask survived the first dialog closing");
  dialog.answer(PRIMARY);
  await settle();
  stop();
});

test("a dialog asked to open before its element loads opens when it loads", () => {
  const anchor = new FakeAnchor({
    name: "panel",
    isLoaded: false
  });
  const { dialog, state, stop } = dialogIn(anchor);
  state.open = true;
  flushSync();
  assert.equal(dialog.shown, 0);
  anchor.load();
  assert.equal(dialog.shown, 1);
  dialog.answer(NONE);
  stop();
});

test("a dialog that is open closes with its component", async () => {
  const { dialog, state, stop } = dialogIn(new FakeAnchor({ name: "panel" }));
  state.open = true;
  flushSync();
  await settle();
  stop();
  assert.equal(dialog.hidden, 1);
});
