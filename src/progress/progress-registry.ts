import { aggregateSnapshots } from "./aggregate.ts";
import { CHANGE_EVENT, reactiveReads, subscribeTo } from "./progress-source.ts";
import type { ProgressSource, TrackedOperation } from "./progress-source.ts";
import { ProgressState } from "./progress-state.ts";
import type { ProgressSnapshot } from "./progress-state.ts";

/** What a scope keeps: a group name, or a test of each operation. */
export type ProgressFilter = string | ((operation: TrackedOperation) => boolean);

/** What `ProgressRegistry` takes; `where` makes the scoped kind. */
interface ProgressRegistryOptions {
  readonly parent?: ProgressRegistry;
  readonly filter?: ProgressFilter;
}

function matcherOf(filter: ProgressFilter) {
  const isGroup = typeof filter === "string";
  if (isGroup) {
    return (operation: TrackedOperation) => operation.group === filter;
  }

  return filter;
}

/**
 * The operations that are running now, as one source: the overall bar for a
 * taskbar button and the count for a tray line. Operations list themselves
 * here (the app-wide one, `defaultProgressRegistry()`, unless told otherwise);
 * a finished one leaves, a failed one stays until `clearFailed` or `remove`,
 * so a red bar is not lost. It fires `add`, `remove` and `change`
 * (a `CustomEvent` whose `detail` is the operation, except for `change`).
 *
 * `where` scopes it by group or by test, which is how tray icon A shows the
 * downloads and tray icon B the uploads, and each window's taskbar button
 * shows its own work.
 */
export class ProgressRegistry extends EventTarget implements ProgressSource {
  private readonly parent: ProgressRegistry | undefined;
  private readonly matches: ((operation: TrackedOperation) => boolean) | undefined;
  private readonly held = new Set<TrackedOperation>();
  private readonly reads = reactiveReads(this);
  private list: readonly TrackedOperation[] = [];
  private current: ProgressSnapshot = aggregateSnapshots([]);
  private readonly onParentChange = () => this.refresh();

  /** Made by `where`, or by an app that wants a registry of its own. */
  constructor(options: ProgressRegistryOptions = {}) {
    super();
    this.parent = options.parent;
    this.matches = options.filter === undefined ? undefined : matcherOf(options.filter);
    this.parent?.addEventListener(CHANGE_EVENT, this.onParentChange);
    this.refresh();
  }

  /** The operations in the registry, oldest first. Reactive. */
  get operations() {
    this.reads();
    return this.list;
  }

  get snapshot() {
    return this.current;
  }

  /** How far along, 0 to 1, over the operations that know their total. Reactive. */
  get value() {
    this.reads();
    return this.current.value;
  }

  /** How many operations are unfinished. Reactive. */
  get count() {
    this.reads();
    return this.current.count;
  }

  get state() {
    this.reads();
    return this.current.state;
  }

  get isIndeterminate() {
    this.reads();
    return this.current.isIndeterminate;
  }

  get showPaused() {
    this.reads();
    return this.current.showPaused;
  }

  get showError() {
    this.reads();
    return this.current.showError;
  }

  /** The five values a `ProgressBar` takes, for `<ProgressBar {...registry.barProps} />`. Reactive. */
  get barProps() {
    this.reads();
    const { current } = this;
    return {
      value: current.value,
      maximum: 1,
      isIndeterminate: current.isIndeterminate,
      showPaused: current.showPaused,
      showError: current.showError
    } as const;
  }

  subscribe(run: (snapshot: ProgressSnapshot) => void) {
    return subscribeTo({
      source: this,
      run
    });
  }

  /**
   * A view of the operations that pass `filter`: it follows this registry and
   * is a source of its own. Call `dispose` when it is no longer used.
   *
   * @param filter - A group name, or a test of each operation.
   * @returns The scoped registry.
   */
  where(filter: ProgressFilter) {
    return new ProgressRegistry({
      parent: this,
      filter
    });
  }

  /**
   * Lists an operation; a scoped registry lists it in the registry it follows.
   *
   * @param operation - The operation to show.
   * @returns The operation.
   */
  add(operation: TrackedOperation) {
    const isScoped = this.parent !== undefined;
    if (isScoped) {
      this.parent.add(operation);
      return operation;
    }

    const isHeld = this.held.has(operation);
    if (isHeld) {
      return operation;
    }

    this.held.add(operation);
    operation.addEventListener(CHANGE_EVENT, this.onParentChange);
    operation.addEventListener("loadend", this.onEnd);
    this.dispatchEvent(new CustomEvent("add", { detail: operation }));
    this.refresh();
    return operation;
  }

  /**
   * Takes an operation out, whatever its state.
   *
   * @param operation - The operation to forget.
   */
  remove(operation: TrackedOperation) {
    const isScoped = this.parent !== undefined;
    if (isScoped) {
      this.parent.remove(operation);
      return;
    }

    const isHeld = this.held.delete(operation);
    if (!isHeld) {
      return;
    }

    operation.removeEventListener(CHANGE_EVENT, this.onParentChange);
    operation.removeEventListener("loadend", this.onEnd);
    this.dispatchEvent(new CustomEvent("remove", { detail: operation }));
    this.refresh();
  }

  /** Takes the failed operations out, which turns a red bar off. */
  clearFailed() {
    for (const operation of this.list) {
      const isFailed = operation.state === ProgressState.ERROR;
      if (isFailed) {
        this.remove(operation);
      }
    }
  }

  /** Stops following the registry a scoped one was made from. */
  dispose() {
    this.parent?.removeEventListener(CHANGE_EVENT, this.onParentChange);
  }

  private readonly onEnd = (event: Event) => {
    const { target } = event;
    const operation = [...this.held].find(candidate => candidate === target);
    const isGone = operation !== undefined && operation.state !== ProgressState.ERROR;
    if (isGone) {
      this.remove(operation);
    }
  };

  private refresh() {
    const source = this.parent === undefined ? [...this.held] : this.parent.list;
    const { matches } = this;
    this.list = matches === undefined ? source : source.filter(matches);
    this.current = aggregateSnapshots(this.list.map(operation => operation.snapshot));
    this.dispatchEvent(new Event(CHANGE_EVENT));
  }
}

let shared: ProgressRegistry | undefined;

/**
 * The app-wide registry, made on first use: every operation lists itself here
 * unless it is given another.
 *
 * @returns The registry.
 */
export function defaultProgressRegistry() {
  shared ??= new ProgressRegistry();
  return shared;
}
