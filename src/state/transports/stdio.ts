import type { Transport, TransportListener } from "./transport.ts";
import type { Frame as MessagingFrame } from "#src/messaging/frame.js";
import { jsonSchema } from "#src/messaging/json.js";
import { createInterface } from "node:readline";
import type { Readable, Writable } from "node:stream";

// JSON lines on a process's stdin and stdout: one message per line each way.
// The host starts the window as a child process and uses these two pipes as
// its protocol, so nothing else may be written to stdout (reserveStdout).

/** The two pipes of a stdio transport: what it reads and what it writes. */
export interface StdioStreams {
  input: Readable;
  output: Writable;
}

/**
 * A transport over JSON lines: the process's own stdin and stdout by
 * default, or the pipes of a child process the caller holds.
 */
export function createStdioTransport<Frame = MessagingFrame>(streams: StdioStreams = {
  input: process.stdin,
  output: process.stdout
}) {
  const transport: Transport<Frame> = {
    send(frame) {
      streams.output.write(`${JSON.stringify(frame)}\n`);
    },
    listen(listener: TransportListener) {
      const lines = createInterface({ input: streams.input });
      lines.on("line", line => {
        const isBlank = line.trim().length === 0;
        if (isBlank) {
          return;
        }

        try {
          listener.message(jsonSchema.parse(JSON.parse(line)));
        } catch (error) {
          listener.malformed(error instanceof Error ? error.message : String(error));
        }
      });
      lines.on("close", () => listener.closed());
      return () => lines.close();
    }
  };
  return transport;
}

/**
 * Sends what the app prints with console.log/info/debug to stderr, so a stray
 * log line cannot corrupt the protocol. Call once, first thing in the process.
 */
export function reserveStdout() {
  function toStderr(...values: Parameters<typeof console.error>) {
    console.error(...values);
  }
  console.log = toStderr;
  console.info = toStderr;
  console.debug = toStderr;
}
