import type { Transport, TransportListener } from "./transport.ts";
import type { Frame as MessagingFrame } from "#src/messaging/frame.js";
import type { MessagePort } from "node:worker_threads";

// A worker's MessagePort, as Edge+'s main thread and window thread use one.
// The UI thread's libuv turns between WinUI's messages (window/message-pump.ts),
// so the port's own events fire there.

/** A transport over a worker's MessagePort. */
export interface MessagePortSetup {
  port: MessagePort;

  /**
   * Whether listening keeps the thread alive (default true, as a MessagePort
   * listener does); false lets the thread end while the transport listens.
   */
  shouldKeepAlive?: boolean;
}

/** A transport over `port`, driven by the port's own events. */
export function createMessagePortTransport<Frame = MessagingFrame>({ port, shouldKeepAlive = true }: MessagePortSetup) {
  const transport: Transport<Frame> = {
    send(frame) {
      port.postMessage(frame);
    },
    listen(listener: TransportListener) {
      port.on("message", value => listener.message(value));
      port.on("close", () => listener.closed());

      if (!shouldKeepAlive) {
        port.unref();
      }

      return () => {
        port.removeAllListeners("message");
        port.removeAllListeners("close");
      };
    }
  };
  return transport;
}
