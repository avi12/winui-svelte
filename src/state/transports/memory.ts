import type { Transport, TransportListener } from "./transport.ts";
import type { Frame as MessagingFrame } from "#src/messaging/frame.js";
import type { Json } from "#src/messaging/json.js";
import { jsonSchema } from "#src/messaging/json.js";

// Two ends of an in-memory link, for tests and for a host and a window in one
// process. Delivery is asynchronous (a microtask) and ordered, like a real
// transport, so code written against it cannot rely on synchronous delivery.
// What is sent is copied through JSON, as any real link would.

type Delivery = (listener: TransportListener) => void;

/**
 * One end of an in-memory link; `MemoryEnd.pair()` makes both. What an end
 * sends arrives, in order, at the other end's listener.
 */
export class MemoryEnd<Frame = MessagingFrame> implements Transport<Frame> {
  private peer: MemoryEnd<Frame> | null = null;
  private listener: TransportListener | null = null;
  private readonly inbox: Delivery[] = [];

  /** Two ends that are each other's peer. */
  static pair<Frame = MessagingFrame>() {
    const left = new MemoryEnd<Frame>();
    const right = new MemoryEnd<Frame>();
    left.peer = right;
    right.peer = left;
    return [left, right] as const;
  }

  send(frame: Frame) {
    const copy = jsonSchema.parse(JSON.parse(JSON.stringify(frame)));
    this.peer?.receive(listener => listener.message(copy));
  }

  /**
   * Sends a JSON value that is no frame, which the other side must report
   * (the messaging tests send it; fallow does not trace the tests).
   */
  sendJson(value: Json) {
    this.peer?.receive(listener => listener.message(value));
  }

  /** Sends a line the other side could not read. */
  sendMalformed(reason: string) {
    this.peer?.receive(listener => listener.malformed(reason));
  }

  /** Ends this side: the other side is told the link closed. */
  close() {
    this.peer?.receive(listener => listener.closed());
  }

  listen(listener: TransportListener) {
    this.listener = listener;
    queueMicrotask(() => this.flush());
    return () => {
      this.listener = null;
    };
  }

  private receive(delivery: Delivery) {
    this.inbox.push(delivery);
    queueMicrotask(() => this.flush());
  }

  private flush() {
    while (this.listener !== null && this.inbox.length > 0) {
      this.inbox.shift()?.(this.listener);
    }
  }
}
