import type { Transport, TransportListener } from "./transport.ts";
import type { Frame as MessagingFrame } from "#src/messaging/frame.js";
import type { MessagePort } from "node:worker_threads";
import { receiveMessageOnPort } from "node:worker_threads";

// A worker's MessagePort, as Edge+'s main thread and window thread use one.
//
// On a thread where Node's event loop does not turn (WinUI's loop holds it),
// the port's own "message" event never fires: pass `poll`, which calls the
// function it is given on a timer of the app's (a DispatcherQueue timer) and
// returns how to stop it. Without `poll` the port's events are used.

/** How a MessagePort transport is driven. */
export interface MessagePortOptions {
  /**
   * Called with a `drain` function to run on the app's own timer; returns how
   * to stop that timer. Without it, the port's own events are used.
   */
  poll?(drain: () => void): () => void;
}

/** A transport over a worker's MessagePort. */
export interface MessagePortSetup extends MessagePortOptions {
  port: MessagePort;
}

/**
 * A transport over `port`. On a thread where Node's event loop does not turn,
 * pass `poll` to drive it from a timer of the app's.
 */
export function createMessagePortTransport<Frame = MessagingFrame>({ port, poll }: MessagePortSetup) {
  const transport: Transport<Frame> = {
    send(frame) {
      port.postMessage(frame);
    },
    listen(listener: TransportListener) {
      const isDrivenByPort = poll === undefined;
      if (isDrivenByPort) {
        port.on("message", value => listener.message(value));
        port.on("close", () => listener.closed());
        return () => {
          port.removeAllListeners("message");
          port.removeAllListeners("close");
        };
      }

      function drain() {
        let received = receiveMessageOnPort(port);
        while (received !== undefined) {
          listener.message(received.message);
          received = receiveMessageOnPort(port);
        }
      }
      return poll(drain);
    }
  };
  return transport;
}
