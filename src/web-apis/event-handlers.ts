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

/** A target with the `onconnect` and `ondisconnect` handler properties. */
export class ConnectionHandlerTarget extends HandlerEventTarget {
  // fallow-ignore-next-line unused-class-member
  get onconnect() {
    return this.getHandler("connect");
  }

  // fallow-ignore-next-line unused-class-member
  set onconnect(handler: EventListener | null) {
    this.setHandler({
      type: "connect",
      handler
    });
  }

  // fallow-ignore-next-line unused-class-member
  get ondisconnect() {
    return this.getHandler("disconnect");
  }

  // fallow-ignore-next-line unused-class-member
  set ondisconnect(handler: EventListener | null) {
    this.setHandler({
      type: "disconnect",
      handler
    });
  }
}
