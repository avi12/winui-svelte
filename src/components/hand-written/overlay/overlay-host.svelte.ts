import type { QueueTicket } from "./overlay-queue.ts";
import { dialogQueue } from "./overlay-queue.ts";
import { Linker } from "#src/components/runtime.svelte.js";
import type { PlacedControl } from "#src/renderer/host/control.js";
import { untrack } from "svelte";

// What the flyouts and ContentDialog add to the control: `open`, kept in step
// with whether the control is open, the element it opens next to, and for a
// dialog the answer. The members the host reads are named here, so it runs on
// stand-ins in a test and on the bindings' classes in an app.

/** An element the overlay can open next to: in the window, or about to be. */
export interface LoadableElement<Root> {
  readonly isLoaded: boolean;
  readonly xamlRoot: Root;
  onceLoaded(handler: () => void): () => void;
}

/** The part of a flyout (FlyoutBase) the host drives. */
export interface FlyoutControl {
  readonly isOpen: boolean;
  showAt(target: LoadableElement<unknown>): void;
  hide(): void;
  onOpened(handler: () => void): () => void;
  onClosed(handler: () => void): () => void;
}

/** The part of a ContentDialog the host drives. */
export interface DialogControl<Root, Result> {
  xamlRoot: Root;
  showAsync(): Promise<Result>;
  hide(): void;
  onOpened(handler: () => void): () => void;
}

/** The props the flyout host reads. */
export interface FlyoutHostProps {
  target?: LoadableElement<unknown> | undefined;
}

/** The props the dialog host reads. */
export interface DialogHostProps<Root, Result> {
  target?: LoadableElement<Root> | undefined;
  onresult?: ((result: Result) => void) | undefined;
}

/** The component's `open`, as the component binds it. */
export interface OverlayBound {
  open: boolean | undefined;
}

function stopNothing() {}

const LOADABLE_KEYS = ["isLoaded", "xamlRoot", "onceLoaded"] as const;

function isLoadable<Root>(value: object | null | undefined): value is LoadableElement<Root> {
  return value != null && LOADABLE_KEYS.every(key => key in value);
}

// The element the overlay opens next to: the app's `target`, else where the
// overlay is written. Read when the overlay opens, not before.
function anchorOf<Root>({ target, placed }: {
  target: LoadableElement<Root> | undefined;
  placed: PlacedControl<object>;
}) {
  const anchor = target ?? placed.parent();
  if (isLoadable<Root>(anchor)) {
    return anchor;
  }

  throw new Error("an overlay needs an element to open next to: write it inside a control, or give it target");
}

// Runs `run` now when the element is on screen, else when it loads. Returns what
// stops the wait.
function whenLoaded({ element, run }: {
  element: LoadableElement<unknown>;
  run: () => void;
}) {
  if (element.isLoaded) {
    run();
    return stopNothing;
  }

  return element.onceLoaded(run);
}

/**
 * Keeps a flyout's `open` in step with whether it is open. Setting `open`
 * shows the flyout next to its anchor (or hides it); a flyout the user closes
 * sets `open` back to false.
 *
 * @param options - The flyout and where it is written, its props, and the component's `open`.
 * @returns The link, to dispose when the component goes: the flyout is closed then.
 */
export function attachFlyout({ placed, props, bound }: {
  placed: PlacedControl<FlyoutControl>;
  props: FlyoutHostProps;
  bound: OverlayBound;
}) {
  const flyout = placed.control;
  const link = new Linker();
  let stopWaiting = stopNothing;

  function show() {
    const anchor = untrack(() => anchorOf({
      target: props.target,
      placed
    }));
    stopWaiting = whenLoaded({
      element: anchor,
      run: () => flyout.showAt(anchor)
    });
  }

  function hide() {
    stopWaiting();
    stopWaiting = stopNothing;

    if (flyout.isOpen) {
      flyout.hide();
    }
  }

  link.bindable({
    bound,
    key: "open",
    access: {
      read: () => flyout.isOpen,
      write(isOpen) {
        hide();

        if (isOpen) {
          show();
        }
      }
    },
    subscribers: [handler => flyout.onOpened(handler), handler => flyout.onClosed(handler)]
  });
  link.add(hide);
  return link;
}

// One ask for the dialog to be open: waiting for its anchor to load, waiting
// its turn, showing.
interface DialogRequest<Result> {
  stopWaiting: () => void;
  ticket: QueueTicket<Result> | null;
  // Closed by the app before the dialog finished opening.
  isClosing: boolean;
}

/**
 * Keeps a ContentDialog's `open` in step with whether it is open, and answers
 * `onresult`. Dialogs open one after another (WinUI shows one at a time), each
 * in the window of the element it is written in or `target`; one the user
 * closes sets `open` back to false.
 *
 * @param options - The dialog and where it is written, its props, and the component's `open`.
 * @returns The link, to dispose when the component goes: the dialog is closed then.
 */
export function attachDialog<Root, Result>({ placed, props, bound }: {
  placed: PlacedControl<DialogControl<Root, Result>>;
  props: DialogHostProps<Root, Result>;
  bound: OverlayBound;
}) {
  const dialog = placed.control;
  const link = new Linker();
  // The request the app wants open: none once it is closed, whatever the
  // dialog is still doing.
  let current: DialogRequest<Result> | null = null;
  // The request whose ShowAsync is running.
  let showing: DialogRequest<Result> | null = null;
  let notify = stopNothing;

  function finish({ request, result }: {
    request: DialogRequest<Result>;
    result: Result | undefined;
  }) {
    const isCurrent = current === request;
    if (isCurrent) {
      current = null;
    }

    const isShowing = showing === request;
    if (isShowing) {
      showing = null;
    }

    notify();

    const isAnswered = result !== undefined;
    if (isAnswered) {
      props.onresult?.(result);
    }
  }

  function enqueue({ request, anchor }: {
    request: DialogRequest<Result>;
    anchor: LoadableElement<Root>;
  }) {
    const ticket = dialogQueue().enqueue({
      show() {
        showing = request;
        dialog.xamlRoot = anchor.xamlRoot;
        return dialog.showAsync();
      }
    });
    request.ticket = ticket;
    ticket.result.then(
      result => finish({
        request,
        result
      }),
      (error: unknown) => {
        finish({
          request,
          result: undefined
        });
        throw error;
      }
    );
  }

  function open() {
    const isOpenRequested = current !== null;
    if (isOpenRequested) {
      return;
    }

    const anchor = untrack(() => anchorOf({
      target: props.target,
      placed
    }));
    const request: DialogRequest<Result> = {
      stopWaiting: stopNothing,
      ticket: null,
      isClosing: false
    };
    current = request;
    request.stopWaiting = whenLoaded({
      element: anchor,
      run: () => enqueue({
        request,
        anchor
      })
    });
  }

  function close() {
    const request = current;
    const isClosed = request === null;
    if (isClosed) {
      return;
    }

    request.stopWaiting();
    current = null;
    const isStillWaiting = request.ticket === null || request.ticket.cancel();
    if (isStillWaiting) {
      return;
    }

    request.isClosing = true;
    dialog.hide();
  }

  link.bindable({
    bound,
    key: "open",
    access: {
      read: () => current !== null,
      write(isOpen) {
        if (isOpen) {
          open();
          return;
        }

        close();
      }
    },
    subscribers: [handler => {
      notify = handler;
      return () => {
        notify = stopNothing;
      };
    }]
  });
  // A hide() before the dialog finished opening is lost: close it as it opens.
  link.add(
    dialog.onOpened(() => {
      const isClosingWhileOpening = showing?.isClosing === true;
      if (isClosingWhileOpening) {
        dialog.hide();
      }
    })
  );
  link.add(close);
  return link;
}
