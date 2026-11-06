// The messages of the UI thread's queue that belong to no window: a hotkey
// (`WM_HOTKEY`) is posted to the thread, so no window procedure ever sees it.
// The pump (native.ts) offers every message it takes to these hooks before the
// content and the window; a hook that returns true has handled the message.
// One list per thread, whichever copy of this module asks (see ui-timers.ts).

/** A message taken off the thread's queue. */
export interface ThreadMessage {
  /** The window it was posted to; 0n for a thread message. */
  readonly hwnd: bigint;
  readonly id: number;
  readonly wParam: bigint;
  readonly lParam: bigint;
}

/** Looks at a message before it is dispatched; true when it handled the message, which is then dropped. */
export type MessageHook = (message: ThreadMessage) => boolean;

const SHARED_KEY = Symbol.for("winui-svelte.message-hooks");

function hooksOfThread() {
  const existing: unknown = Object.getOwnPropertyDescriptor(globalThis, SHARED_KEY)?.value;
  const isShared = existing instanceof Set;
  if (isShared) {
    return existing;
  }

  const created = new Set<MessageHook>();
  Object.defineProperty(globalThis, SHARED_KEY, { value: created });
  return created;
}

/**
 * Adds a hook to this thread's pump. It is called for every message the pump
 * takes, so it must return false at once for the ones it does not know.
 *
 * @param hook - The hook.
 * @returns A function that takes the hook away again.
 */
export function addMessageHook(hook: MessageHook) {
  const hooks = hooksOfThread();
  hooks.add(hook);
  return () => {
    hooks.delete(hook);
  };
}

/**
 * Offers `message` to the hooks in the order they were added.
 *
 * @param message - The message taken.
 * @returns True when a hook handled it.
 */
export function runMessageHooks(message: ThreadMessage) {
  for (const hook of hooksOfThread()) {
    const isHandled = hook(message);
    if (isHandled) {
      return true;
    }
  }

  return false;
}
