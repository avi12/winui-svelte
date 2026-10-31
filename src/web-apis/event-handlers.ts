/** An `EventTarget` with the `onclick`-style handler properties the Web APIs have. */
export class HandlerEventTarget extends EventTarget {
  private readonly handlers = new Map<string, EventListener>();

  /** Reads the handler property for an event type. */
  protected getHandler(type: string) {
    return this.handlers.get(type) ?? null;
  }

  /** Sets the handler property for an event type; `null` removes it. */
  protected setHandler({ type, handler }: {
    type: string;
    handler: EventListener | null;
  }) {
    const previous = this.handlers.get(type);
    const hasPrevious = previous !== undefined;
    if (hasPrevious) {
      this.removeEventListener(type, previous);
      this.handlers.delete(type);
    }

    const isFunction = typeof handler === "function";
    if (isFunction) {
      this.handlers.set(type, handler);
      this.addEventListener(type, handler);
    }
  }
}
