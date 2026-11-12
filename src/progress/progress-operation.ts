import { OperationProgressEvent } from "./progress-event.ts";
import { defaultProgressRegistry } from "./progress-registry.ts";
import type { ProgressRegistry } from "./progress-registry.ts";
import { CHANGE_EVENT, reactiveReads, subscribeTo } from "./progress-source.ts";
import type { ProgressSource } from "./progress-source.ts";
import { fractionOf, isUnfinished, ProgressState } from "./progress-state.ts";
import type { ProgressSnapshot } from "./progress-state.ts";
import { HandlerEventTarget } from "#src/web-apis/event-handlers.js";

const HANDLED_EVENTS = ["loadstart", "progress", "load", "error", "abort", "loadend"] as const;
const FINAL_EVENTS = {
  [ProgressState.COMPLETE]: "load",
  [ProgressState.ERROR]: "error",
  [ProgressState.CANCELED]: "abort"
} as const;

/** The event handlers an operation takes in its options, named as the DOM names `onprogress` and its kin. */
export interface ProgressHandlers {
  readonly onloadstart?: (event: OperationProgressEvent) => void;
  readonly onprogress?: (event: OperationProgressEvent) => void;
  readonly onload?: (event: OperationProgressEvent) => void;
  readonly onerror?: (event: OperationProgressEvent) => void;
  readonly onabort?: (event: OperationProgressEvent) => void;
  readonly onloadend?: (event: OperationProgressEvent) => void;
}

/** What `ProgressOperation` takes. */
export interface ProgressOperationOptions extends ProgressHandlers {
  /** What the operation is, for a tray line or a window: a file name, "Copying". */
  readonly label?: string;

  /**
   * A name to scope by: `registry.where("sync")`, `<TaskbarProgress group="sync" />`
   * and `<TrayMenuProgress group="sync" />` show only the operations of that group.
   */
  readonly group?: string;

  /** The whole size, when known up front; `update` can set it later. */
  readonly total?: number;

  /** Aborting it cancels the operation, as it cancels a `fetch`. */
  readonly signal?: AbortSignal;

  /**
   * Where the operation lists itself so that `<TaskbarProgress />` and the
   * tray lines see it: the app-wide registry by default, `false` for none.
   */
  readonly registry?: ProgressRegistry | false;
}

/** What `ProgressBar` takes to show an operation. */
export interface ProgressBarValues {
  readonly value: number;
  readonly maximum: 1;
  readonly isIndeterminate: boolean;
  readonly showPaused: boolean;
  readonly showError: boolean;
}

function markHandled() {
  // Attached to the result so that an operation nobody awaits raises no unhandled rejection
}

/**
 * One long operation (a download, a file read, a copy, an OCR pass), in one
 * object that is
 * - a promise: `await operation` gives the result and rejects on failure or
 *   cancel;
 * - an `EventTarget` with the platform events: `loadstart`, `progress`,
 *   `load`, `error`, `abort` and `loadend` as `OperationProgressEvent`s, as
 *   `XMLHttpRequest` and `FileReader` fire them (and `onprogress` and kin as
 *   properties or options);
 * - observable: `value`, `loaded`, `total`, `state`, `isIndeterminate`,
 *   `showPaused` and `showError` are reactive in markup (`barProps` spreads
 *   onto a `ProgressBar`), and it is a Svelte store (`$operation`);
 * - cancelable: `cancel()`, or abort the `signal` given to it.
 *
 * It lists itself in the app-wide registry, so a mounted `<TaskbarProgress />`
 * shows it with no setup. An errored operation can `resume` (a retry); the
 * other final states are final.
 */
export class ProgressOperation<Result = void> extends HandlerEventTarget
  implements ProgressSource, PromiseLike<Result> {
  /** Aborts when the operation is canceled, or when the `signal` given to the constructor aborts. */
  readonly signal: AbortSignal;

  /** The group it was given, to scope a registry by. */
  readonly group: string | undefined;

  /** Settles with the operation: the value given to `complete`, or the reason of `fail` or `cancel`. */
  readonly result: Promise<Result>;
  private readonly controller = new AbortController();
  private readonly reads = reactiveReads(this);
  private readonly resolveResult: (value: Result) => void;
  private readonly rejectResult: (reason: unknown) => void;
  private current: ProgressSnapshot;
  private currentState: ProgressState = ProgressState.IDLE;
  private currentLoaded = 0;
  private currentTotal: number | undefined;
  private currentError: unknown;
  private currentLabel: string | undefined;

  constructor(options: ProgressOperationOptions = {}) {
    super();
    const deferred = Promise.withResolvers<Result>();
    this.result = deferred.promise;
    this.resolveResult = deferred.resolve;
    this.rejectResult = deferred.reject;
    this.result.catch(markHandled);
    this.group = options.group;
    this.currentLabel = options.label;
    this.currentTotal = options.total;
    const { signal: outside } = options;
    this.signal = outside === undefined ? this.controller.signal : AbortSignal.any([this.controller.signal, outside]);
    this.current = this.build();
    for (const type of HANDLED_EVENTS) {
      const handler = options[`on${type}`];
      const isHandled = handler !== undefined;
      if (isHandled) {
        this.addEventListener(type, event => {
          const isProgressEvent = event instanceof OperationProgressEvent;
          if (isProgressEvent) {
            handler(event);
          }
        });
      }
    }

    const isListed = options.registry !== false;
    if (isListed) {
      (options.registry ?? defaultProgressRegistry()).add(this);
    }

    if (this.signal.aborted) {
      this.settle(ProgressState.CANCELED);
      return;
    }

    this.signal.addEventListener("abort", () => this.settle(ProgressState.CANCELED), { once: true });
  }

  get snapshot() {
    return this.current;
  }

  get state() {
    this.reads();
    return this.current.state;
  }

  get loaded() {
    this.reads();
    return this.current.loaded;
  }

  get total() {
    this.reads();
    return this.current.total;
  }

  /** How far along, 0 to 1; `ProgressBar`'s `value` with a `maximum` of 1. Reactive. */
  get value() {
    this.reads();
    return this.current.value;
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

  /** Why it failed, once `state` is `error`. */
  get error() {
    this.reads();
    return this.currentError;
  }

  /** What the operation is. Reactive. */
  get label() {
    this.reads();
    return this.currentLabel;
  }

  set label(label: string | undefined) {
    this.currentLabel = label;
    this.publish();
  }

  /** The values a `ProgressBar` takes, for `<ProgressBar {...operation.barProps} />`. Reactive. */
  get barProps() {
    this.reads();
    const { current } = this;
    return {
      value: current.value,
      maximum: 1,
      isIndeterminate: current.isIndeterminate,
      showPaused: current.showPaused,
      showError: current.showError
    } satisfies ProgressBarValues;
  }

  get onloadstart() {
    return this.getHandler("loadstart");
  }

  set onloadstart(handler: EventListener | null) {
    this.setHandler({
      type: "loadstart",
      handler
    });
  }

  get onprogress() {
    return this.getHandler("progress");
  }

  set onprogress(handler: EventListener | null) {
    this.setHandler({
      type: "progress",
      handler
    });
  }

  get onload() {
    return this.getHandler("load");
  }

  set onload(handler: EventListener | null) {
    this.setHandler({
      type: "load",
      handler
    });
  }

  get onerror() {
    return this.getHandler("error");
  }

  set onerror(handler: EventListener | null) {
    this.setHandler({
      type: "error",
      handler
    });
  }

  get onabort() {
    return this.getHandler("abort");
  }

  set onabort(handler: EventListener | null) {
    this.setHandler({
      type: "abort",
      handler
    });
  }

  get onloadend() {
    return this.getHandler("loadend");
  }

  set onloadend(handler: EventListener | null) {
    this.setHandler({
      type: "loadend",
      handler
    });
  }

  /**
   * Makes the operation awaitable: `await operation` is `await operation.result`.
   *
   * @param onfulfilled - Called with the result.
   * @param onrejected - Called with the reason of a failure or cancel.
   * @returns The promise of what the callbacks return.
   */
  then<Fulfilled = Result, Rejected = never>(
    onfulfilled?: ((value: Result) => Fulfilled | PromiseLike<Fulfilled>) | null,
    onrejected?: ((reason: unknown) => Rejected | PromiseLike<Rejected>) | null
  ) {
    return this.result.then(onfulfilled, onrejected);
  }

  subscribe(run: (snapshot: ProgressSnapshot) => void) {
    return subscribeTo({
      source: this,
      run
    });
  }

  /** Marks the work as begun and fires `loadstart`; nothing happens unless the operation is idle. */
  start() {
    const isIdle = this.currentState === ProgressState.IDLE;
    if (!isIdle) {
      return;
    }

    this.currentState = ProgressState.RUNNING;
    this.publish();
    this.fire("loadstart");
  }

  /**
   * Reports the work done and fires `progress`. Ignored unless the operation
   * runs.
   *
   * @param options - How much is done, and the whole size when it became known.
   */
  update({ loaded, total }: {
    loaded: number;
    total?: number | undefined;
  }) {
    const isRunning = this.currentState === ProgressState.RUNNING;
    if (!isRunning) {
      return;
    }

    this.currentLoaded = loaded;

    const isTotalKnown = total !== undefined;
    if (isTotalKnown) {
      this.currentTotal = total;
    }

    this.publish();
    this.fire("progress");
  }

  /** Holds a running operation (the bar shows paused); `resume` continues it. */
  pause() {
    const isRunning = this.currentState === ProgressState.RUNNING;
    if (!isRunning) {
      return;
    }

    this.currentState = ProgressState.PAUSED;
    this.publish();
    this.fire("pause");
  }

  /** Continues a paused operation, or retries an errored one. */
  resume() {
    const isResumable = this.currentState === ProgressState.PAUSED || this.currentState === ProgressState.ERROR;
    if (!isResumable) {
      return;
    }

    this.currentState = ProgressState.RUNNING;
    this.currentError = undefined;
    this.publish();
    this.fire("resume");
  }

  /**
   * Ends it successfully: `load`, then `loadend`, and `await operation` gives `value`.
   *
   * @param value - The result.
   */
  complete(value: Result) {
    const isOpen = this.canSettle();
    if (!isOpen) {
      return;
    }

    this.resolveResult(value);
    this.settle(ProgressState.COMPLETE);
  }

  /**
   * Ends it with a failure: `error`, then `loadend`, and `await operation` throws `reason`.
   *
   * @param reason - What went wrong, kept as `error`.
   */
  fail(reason: unknown) {
    const isOpen = this.canSettle();
    if (!isOpen) {
      return;
    }

    this.currentError = reason;
    this.rejectResult(reason);
    this.settle(ProgressState.ERROR);
  }

  /**
   * Ends it by request: aborts `signal`, which fires `abort` and `loadend`,
   * and `await operation` throws the reason (an `AbortError` by default).
   *
   * @param reason - Given to the signal.
   */
  cancel(reason?: unknown) {
    this.controller.abort(reason);
  }

  private canSettle() {
    return isUnfinished(this.currentState);
  }

  private settle(state: ProgressState) {
    const isCancel = state === ProgressState.CANCELED;
    const isOpen = this.canSettle() || isCancel && this.currentState === ProgressState.ERROR;
    if (!isOpen) {
      return;
    }

    if (isCancel) {
      this.rejectResult(this.signal.reason);
    }

    this.currentState = state;

    const isComplete = state === ProgressState.COMPLETE;
    if (isComplete) {
      this.currentLoaded = this.currentTotal ?? this.currentLoaded;
    }

    this.publish();
    const isFailure = state === ProgressState.ERROR;
    const isFinishing = isComplete || isFailure;
    const finalState = isFinishing ? state : ProgressState.CANCELED;
    this.fire(FINAL_EVENTS[finalState]);
    this.fire("loadend");
  }

  private fire(type: string) {
    this.dispatchEvent(
      new OperationProgressEvent(type, {
        loaded: this.currentLoaded,
        total: this.currentTotal
      })
    );
  }

  private publish() {
    this.current = this.build();
    this.dispatchEvent(new Event(CHANGE_EVENT));
  }

  private build() {
    const state = this.currentState;
    const isMoving = state === ProgressState.RUNNING || state === ProgressState.PAUSED;
    const hasTotal = this.currentTotal !== undefined && this.currentTotal > 0;
    return {
      state,
      count: isUnfinished(state) ? 1 : 0,
      loaded: this.currentLoaded,
      total: this.currentTotal,
      value: state === ProgressState.COMPLETE ? 1 : fractionOf({
        loaded: this.currentLoaded,
        total: this.currentTotal
      }),
      isIndeterminate: isMoving && !hasTotal,
      showPaused: state === ProgressState.PAUSED,
      showError: state === ProgressState.ERROR,
      label: this.currentLabel
    } satisfies ProgressSnapshot;
  }
}
