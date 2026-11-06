import { DomErrorName, domException } from "./dom-exception.ts";
import { defineProperty } from "./install.ts";
import type { ConnectedAnimationHost } from "#src/renderer/host/connected-animation.js";
import { connectElement } from "#src/renderer/host/connected-animation.js";
import type { ConnectedAnimationKind } from "#src/renderer/host/connected-configuration.js";
import { connectedConfiguration } from "#src/renderer/host/connected-configuration.js";
import { transitionNames } from "#src/renderer/host/view-transition-names.js";
import { isFrameworkElement } from "#src/win2d/element-guard.js";
import type {
  ConnectedAnimationConfiguration
} from "#winui/microsoft/ui/xaml/media/animation/ConnectedAnimationConfiguration";
import { ConnectedAnimationService } from "#winui/microsoft/ui/xaml/media/animation/ConnectedAnimationService";
import type { UIElement } from "#winui/microsoft/ui/xaml/UIElement";

// `document.startViewTransition` of the web over WinUI's connected animations:
// every element with a `view-transition-name` (src/css/view-transition.ts) is
// prepared under its name before the update, and the element named alike after
// it starts the animation, which flies a picture of the first to the second.

const DOCUMENT_PROPERTY = "document";

/** One of WinUI's connected animations as a transition plays it: `ConnectedAnimation`, or a test's stand-in. */
export interface TransitionAnimation {
  configuration: ConnectedAnimationConfiguration;
  tryStart(destination: UIElement): boolean;
  cancel(): void;
  onceCompleted(callback: () => void): () => void;
}

/** The connected animation service a view transition plays through: WinUI's, or a stand-in for a test. */
export interface TransitionAnimationService extends ConnectedAnimationHost {
  getAnimation(key: string): TransitionAnimation | null;
}

/** The update `startViewTransition` runs between the two pictures; it may return a promise. */
export type ViewTransitionUpdate = () => unknown;

/** The object form of `startViewTransition`'s argument. */
export interface ViewTransitionStartOptions {
  readonly update?: ViewTransitionUpdate | null;
  /** The transition's types, which `ViewTransition.types` holds; no selector reads them. */
  readonly types?: readonly string[] | null;
  /** WinUI only: how the elements move; default: WinUI's (`gravity`). */
  readonly configuration?: ConnectedAnimationKind;
}

/** What `installViewTransitions` takes, for a test. */
export interface ViewTransitionsInstallOptions {
  /** The connected animation service; default: the current view's, asked at each transition. */
  readonly connectedAnimations?: TransitionAnimationService;
  /** What waits for an update to reach WinUI's tree; default: one turn of the event loop, after Svelte's flush. */
  readonly settle?: () => Promise<void>;
}

declare global {
  // The WinUI extra joins the standard options wherever this module is imported.
  interface StartViewTransitionOptions {
    /** WinUI only: how the elements move (`gravity`, `direct` or `basic`); default: `gravity`. */
    configuration?: ConnectedAnimationKind;
  }
}

function settleOneTurn() {
  return new Promise<void>(resolve => {
    setTimeout(resolve, 0);
  });
}

function abortedError() {
  return domException({
    name: DomErrorName.ABORT,
    message: "The view transition was skipped"
  });
}

function settlement() {
  const settled = Promise.withResolvers<void>();
  settled.promise.catch(() => undefined);
  return settled;
}

// The elements named now, by name, or the name two of them share (the web skips such a transition).
function namedElements() {
  const elements = new Map<string, UIElement>();
  for (const [control, name] of transitionNames()) {
    const isShared = elements.has(name);
    if (isShared) {
      return {
        elements,
        sharedName: name
      };
    }

    if (isFrameworkElement(control)) {
      elements.set(name, control);
    }
  }

  return {
    elements,
    sharedName: null
  };
}

function sharedNameError(name: string) {
  return domException({
    name: DomErrorName.INVALID_STATE,
    message: `two elements have the view-transition-name ${name}`
  });
}

/** One run of a transition: the promises it settles and the animations it started. */
class TransitionRun {
  readonly updateDone = settlement();
  readonly ready = settlement();
  readonly finished = settlement();
  isSkipped = false;
  private playing: readonly TransitionAnimation[] = [];

  /** Skips the animation; the update still runs, and `finished` follows it. */
  skip() {
    const isFirstSkip = !this.isSkipped;
    if (!isFirstSkip) {
      return;
    }

    this.isSkipped = true;
    this.ready.reject(abortedError());
    for (const animation of this.playing) {
      animation.cancel();
    }

    this.finishWithUpdate();
  }

  /** The update threw or rejected: every promise rejects with its reason. */
  fail(reason: unknown) {
    this.updateDone.reject(reason);
    this.ready.reject(reason);
    this.finished.reject(reason);
  }

  /** The transition will not animate (`reason`), and ends with the update. */
  abandon(reason: unknown) {
    this.ready.reject(reason);
    this.finishWithUpdate();
  }

  /** The animations started: `ready` resolves, `finished` once each has completed. */
  play(animations: readonly TransitionAnimation[]) {
    this.playing = animations;
    this.ready.resolve();
    const completions = animations.map(animation => new Promise<void>(resolve => {
      animation.onceCompleted(() => resolve());
    }));
    void Promise.all(completions).then(() => this.finished.resolve());
  }

  private finishWithUpdate() {
    this.updateDone.promise.then(() => this.finished.resolve(), (reason: unknown) => this.finished.reject(reason));
  }
}

/** A view transition of the web, which `document.startViewTransition` returns. */
export class ViewTransition {
  /** The types it was started with. */
  readonly types: Set<string>;
  /** Settles as the update callback's promise does. */
  readonly updateCallbackDone: Promise<void>;
  /** Resolves when the animations start; rejects when the transition is skipped or the update fails. */
  readonly ready: Promise<void>;
  /** Resolves when the animations end, or with the update when there are none. */
  readonly finished: Promise<void>;
  private readonly onSkip: () => void;

  constructor({ types, updateCallbackDone, ready, finished, onSkip }: {
    types: Iterable<string>;
    updateCallbackDone: Promise<void>;
    ready: Promise<void>;
    finished: Promise<void>;
    onSkip: () => void;
  }) {
    this.types = new Set(types);
    this.updateCallbackDone = updateCallbackDone;
    this.ready = ready;
    this.finished = finished;
    this.onSkip = onSkip;
  }

  /** Skips the animation: the update still runs, and the new state shows at once. */
  skipTransition() {
    this.onSkip();
  }
}

interface TransitionContext {
  readonly service: () => TransitionAnimationService;
  readonly settle: () => Promise<void>;
  active: ViewTransition | null;
}

function startAnimations({ service, before, after, configuration }: {
  service: TransitionAnimationService;
  before: ReadonlyMap<string, UIElement>;
  after: ReadonlyMap<string, UIElement>;
  configuration: ConnectedAnimationKind | undefined;
}) {
  return [...before.keys()].flatMap(name => {
    const animation = service.getAnimation(name);
    const destination = after.get(name);
    const isPaired = animation !== null && destination !== undefined;
    if (!isPaired) {
      animation?.cancel();
      return [];
    }

    const isConfigured = configuration !== undefined;
    if (isConfigured) {
      animation.configuration = connectedConfiguration(configuration);
    }

    return animation.tryStart(destination) ? [animation] : [];
  });
}

function cancelPrepared({ service, names }: {
  service: TransitionAnimationService;
  names: Iterable<string>;
}) {
  for (const name of names) {
    service.getAnimation(name)?.cancel();
  }
}

async function runTransition({ run, update, configuration, context }: {
  run: TransitionRun;
  update: ViewTransitionUpdate | null;
  configuration: ConnectedAnimationKind | undefined;
  context: TransitionContext;
}) {
  const service = context.service();
  const before = namedElements();
  const canAnimate = before.sharedName === null;
  if (canAnimate) {
    for (const [name, element] of before.elements) {
      connectElement({
        key: name,
        element,
        host: service
      });
    }
  }

  try {
    await Promise.resolve();
    await update?.();
    run.updateDone.resolve();
  } catch (error) {
    cancelPrepared({
      service,
      names: before.elements.keys()
    });
    run.fail(error);
    return;
  }

  if (!canAnimate) {
    run.abandon(sharedNameError(before.sharedName));
    return;
  }

  await context.settle();

  if (run.isSkipped) {
    cancelPrepared({
      service,
      names: before.elements.keys()
    });
    return;
  }

  const after = namedElements();
  const isAfterShared = after.sharedName !== null;
  if (isAfterShared) {
    cancelPrepared({
      service,
      names: before.elements.keys()
    });
    run.abandon(sharedNameError(after.sharedName));
    return;
  }

  try {
    run.play(
      startAnimations({
        service,
        before: before.elements,
        after: after.elements,
        configuration
      })
    );
  } catch (error) {
    run.abandon(error);
  }
}

function isUpdate(value: unknown): value is ViewTransitionUpdate {
  return typeof value === "function";
}

function optionsOf(input: ViewTransitionUpdate | ViewTransitionStartOptions | null | undefined) {
  if (isUpdate(input)) {
    return {
      update: input,
      types: [],
      configuration: undefined
    };
  }

  return {
    update: input?.update ?? null,
    types: input?.types ?? [],
    configuration: input?.configuration
  };
}

function startWith(context: TransitionContext) {
  return function startViewTransition(input?: ViewTransitionUpdate | ViewTransitionStartOptions | null) {
    const { update, types, configuration } = optionsOf(input);
    context.active?.skipTransition();
    const run = new TransitionRun();
    const transition = new ViewTransition({
      types,
      updateCallbackDone: run.updateDone.promise,
      ready: run.ready.promise,
      finished: run.finished.promise,
      onSkip: () => run.skip()
    });
    context.active = transition;
    void runTransition({
      run,
      update,
      configuration,
      context
    }).finally(() => {
      const isStillActive = context.active === transition;
      if (isStillActive) {
        context.active = null;
      }
    });
    return transition;
  };
}

/**
 * Defines `document.startViewTransition(update)` and `ViewTransition` over
 * WinUI's connected animations. Each element with a `view-transition-name`
 * (a sheet or a style attribute that sets it imports
 * `winui-svelte/css/view-transition`) is prepared under its name before the
 * update runs; after it, the element with the same name starts the animation,
 * which flies a picture of the old element to where the new one is. The
 * returned transition has `updateCallbackDone`, `ready`, `finished`, `types`
 * and `skipTransition()`. Beyond the web: `configuration` in the options
 * object picks WinUI's motion (`gravity`, `direct` or `basic`). Not covered:
 * the `::view-transition-*` pseudo-elements, the cross-fade of the whole page
 * (`root`), an exit or entrance for a name only one side has, and an element
 * that keeps its name and stays (WinUI will not animate an element to itself).
 * A `document` of the page module is reused; without one a minimal one is
 * defined.
 *
 * @param options - Stand-ins for the connected animation service and the wait for the update, for a test.
 * @returns A function that removes them again.
 */
export function installViewTransitions(options: ViewTransitionsInstallOptions = {}) {
  const { connectedAnimations, settle = settleOneTurn } = options;
  const context: TransitionContext = {
    service: () => connectedAnimations ?? ConnectedAnimationService.getForCurrentView(),
    settle,
    active: null
  };
  const hasDocument = typeof globalThis.document === "object";
  const target = hasDocument ? globalThis.document : {};
  const restores = [
    defineProperty({
      name: "ViewTransition",
      value: ViewTransition
    }),
    defineProperty({
      name: "startViewTransition",
      value: startWith(context),
      target
    })
  ];
  if (!hasDocument) {
    restores.push(
      defineProperty({
        name: DOCUMENT_PROPERTY,
        value: target
      })
    );
  }

  return () => {
    context.active?.skipTransition();
    for (const restore of restores.reverse()) {
      restore();
    }
  };
}
