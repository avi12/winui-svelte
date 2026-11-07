import { ChromeEvent } from "#src/downloads/chrome-event.js";
import type { Json } from "#src/messaging/json.js";

/** Who opened a port or sent a message: the other context's runtime id. */
export interface MessageSender {
  readonly id: string;
}

/** One way out of a port: the link or the host process behind it. */
export interface PortEnd {
  send(message: Json): void;
  close(): void;
}

/** What `new Port` takes. */
export interface PortOptions {
  readonly name: string;
  readonly sender?: MessageSender | undefined;
}

/**
 * `chrome.runtime.Port`: a long-lived channel. `postMessage` sends,
 * `onMessage` hears the other end, `onDisconnect` fires once when the other
 * end goes away or the link fails (`error` then says why, where Chrome sets
 * `lastError`). A port made by `connect` reaches every other context, so
 * `onMessage` may hear several and the port ends when all of them have.
 */
export class Port {
  readonly name: string;
  readonly sender: MessageSender | undefined;
  readonly onMessage = new ChromeEvent<(message: Json, port: Port) => void>();
  readonly onDisconnect = new ChromeEvent<(port: Port) => void>();
  private readonly ends = new Set<PortEnd>();
  private isClosed = false;
  private failure: Error | undefined;

  constructor({ name, sender }: PortOptions) {
    this.name = name;
    this.sender = sender;
  }

  /** Why the port ended, when it ended because something failed. */
  get error() {
    return this.failure;
  }

  /**
   * Sends a JSON value to the other end.
   *
   * @param message - What to send.
   * @throws {Error} When the port is disconnected.
   */
  postMessage(message: Json) {
    if (this.isClosed) {
      throw new Error("Attempting to use a disconnected port object");
    }

    for (const end of this.ends) {
      end.send(message);
    }
  }

  /** Ends the port from this side; the other end hears `onDisconnect`, this one does not. */
  disconnect() {
    if (this.isClosed) {
      return;
    }

    this.isClosed = true;
    const ends = [...this.ends];
    this.ends.clear();
    for (const end of ends) {
      end.close();
    }
  }

  /** Adds a way out; the link calls it. */
  attach(end: PortEnd) {
    this.ends.add(end);
  }

  /** Delivers what the other end sent; the link calls it. */
  receive(message: Json) {
    if (!this.isClosed) {
      this.onMessage.dispatch(message, this);
    }
  }

  /**
   * One way out has gone away; the port ends, and fires `onDisconnect`, when
   * none is left. The link calls it.
   */
  detach({ end, error }: {
    end: PortEnd;
    error?: Error | undefined;
  }) {
    this.ends.delete(end);
    const hasEnds = this.ends.size > 0;
    const isStillOpen = hasEnds || this.isClosed;
    if (isStillOpen) {
      return;
    }

    this.fail(error);
  }

  /** Ends a port that never got a way out, with the reason. The runtime calls it. */
  fail(error?: Error) {
    if (this.isClosed) {
      return;
    }

    this.isClosed = true;
    this.failure = error;
    this.onDisconnect.dispatch(this);
  }
}
