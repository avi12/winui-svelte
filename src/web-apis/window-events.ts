import { HandlerEventTarget } from "./event-handlers.ts";
import { defineProperty } from "./install.ts";

interface WindowEvents {
  readonly dispatch: (event: Event) => void;
  readonly uninstall: () => void;
}

/**
 * The global scope as an event target. A runtime with no window gets just
 * enough of one (`addEventListener`, `removeEventListener`, `dispatchEvent`);
 * one that has an event target (another install defined it) is used as it is.
 *
 * @returns How to fire an event on it, and how to take back what was defined.
 */
export function windowEvents() {
  const hasEventTarget = typeof globalThis.dispatchEvent === "function";
  if (hasEventTarget) {
    return {
      dispatch: event => globalThis.dispatchEvent(event),
      uninstall() {}
    } satisfies WindowEvents;
  }

  const target = new HandlerEventTarget();
  const uninstalls = [
    defineProperty({
      name: "addEventListener",
      value: target.addEventListener.bind(target)
    }),
    defineProperty({
      name: "removeEventListener",
      value: target.removeEventListener.bind(target)
    }),
    defineProperty({
      name: "dispatchEvent",
      value: target.dispatchEvent.bind(target)
    })
  ];
  return {
    dispatch: event => target.dispatchEvent(event),
    uninstall() {
      for (const uninstall of uninstalls) {
        uninstall();
      }
    }
  } satisfies WindowEvents;
}
