import type { Timeout } from "./scheduler.ts";
import { uiTimers } from "./ui-timers.ts";
import { MessageChannel, receiveMessageOnPort, Worker } from "node:worker_threads";
import { z } from "zod";

// `fetch` for the UI thread. Undici's sockets are libuv handles, and the
// thread's libuv never turns once WinUI's loop runs (ui-timers.ts), so a fetch
// started here would never settle. The request runs in a helper thread with a
// loop of its own; its answer comes back over a MessagePort that the UI thread
// reads with receiveMessageOnPort (a synchronous read needs no loop), on a
// timer that runs only while a request is in flight.

const POLL_MILLISECONDS = 4;
const SWITCHING_PROTOCOLS = 101;
const NO_CONTENT = 204;
const RESET_CONTENT = 205;
const NOT_MODIFIED = 304;
const NULL_BODY_STATUSES = new Set([SWITCHING_PROTOCOLS, NO_CONTENT, RESET_CONTENT, NOT_MODIFIED]);
const WORKER_SOURCE = `
const { parentPort, workerData } = require("node:worker_threads");
const port = workerData.port;
const controllers = new Map();
async function run({ id, url, init }) {
  const controller = new AbortController();
  controllers.set(id, controller);
  try {
    const response = await fetch(url, { ...init, signal: controller.signal });
    const headers = [...response.headers].filter(([name]) => name !== "set-cookie");
    for (const cookie of response.headers.getSetCookie()) {
      headers.push(["set-cookie", cookie]);
    }
    port.postMessage({ id, type: "head", status: response.status, statusText: response.statusText, headers, url: response.url });
    if (response.body !== null) {
      for await (const chunk of response.body) {
        port.postMessage({ id, type: "chunk", chunk }, [chunk.buffer]);
      }
    }
    port.postMessage({ id, type: "end" });
  } catch (error) {
    const cause = error instanceof Error && error.cause instanceof Error ? error.cause.message : undefined;
    port.postMessage({ id, type: "error", name: error instanceof Error ? error.name : "Error", message: String(error instanceof Error ? error.message : error), cause });
  } finally {
    controllers.delete(id);
  }
}
port.on("message", message => {
  if (message.type === "abort") {
    controllers.get(message.id)?.abort();
    return;
  }
  void run(message);
});
`;

const headerListSchema = z.array(z.tuple([z.string(), z.string()]));

const answerSchema = z.discriminatedUnion("type", [
  z.object({
    id: z.number(),
    type: z.literal("head"),
    status: z.number(),
    statusText: z.string(),
    headers: headerListSchema,
    url: z.string()
  }),
  z.object({
    id: z.number(),
    type: z.literal("chunk"),
    chunk: z.instanceof(Uint8Array)
  }),
  z.object({
    id: z.number(),
    type: z.literal("end")
  }),
  z.object({
    id: z.number(),
    type: z.literal("error"),
    name: z.string(),
    message: z.string(),
    cause: z.string().optional()
  })
]);

type Answer = z.infer<typeof answerSchema>;

interface Pending {
  readonly resolve: (response: Response) => void;
  readonly reject: (reason: unknown) => void;
  body?: ReadableStreamDefaultController<Uint8Array> | undefined;
}

function createHelper() {
  const { port1, port2 } = new MessageChannel();
  const worker = new Worker(WORKER_SOURCE, {
    eval: true,
    workerData: {
      port: port2
    },
    transferList: [port2]
  });
  worker.unref();
  port1.unref();
  return port1;
}

function failure({ name, message, cause }: Extract<Answer, { type: "error" }>) {
  const isAbort = name === "AbortError";
  if (isAbort) {
    return new DOMException(message, name);
  }

  return new TypeError(message, cause === undefined ? undefined : { cause: new Error(cause) });
}

function createUiFetch() {
  const pending = new Map<number, Pending>();
  let helper: ReturnType<typeof createHelper> | undefined;
  let poll: Timeout | undefined;
  let nextId = 1;
  const { scheduler } = uiTimers();

  function settle(answer: Answer) {
    const request = pending.get(answer.id);
    const isUnknownRequest = request === undefined;
    if (isUnknownRequest) {
      return;
    }

    const isHead = answer.type === "head";
    if (isHead) {
      const hasBody = !NULL_BODY_STATUSES.has(answer.status);
      const body = hasBody
        ? new ReadableStream<Uint8Array>({
          start(controller) {
            request.body = controller;
          },
          cancel() {
            helper?.postMessage({
              type: "abort",
              id: answer.id
            });
          }
        })
        : null;
      const response = new Response(body, {
        status: answer.status,
        statusText: answer.statusText,
        headers: answer.headers
      });
      Object.defineProperty(response, "url", { value: answer.url });
      request.resolve(response);
      return;
    }

    const isChunk = answer.type === "chunk";
    if (isChunk) {
      request.body?.enqueue(answer.chunk);
      return;
    }

    pending.delete(answer.id);

    const isEnd = answer.type === "end";
    if (isEnd) {
      request.body?.close();
      return;
    }

    const reason = failure(answer);
    request.reject(reason);
    request.body?.error(reason);
  }

  function drain() {
    const port = helper;
    const hasHelper = port !== undefined;
    if (hasHelper) {
      for (let received = receiveMessageOnPort(port); received !== undefined; received = receiveMessageOnPort(port)) {
        settle(answerSchema.parse(received.message));
      }
    }

    const isIdle = pending.size === 0;
    const shouldStopPolling = isIdle && poll !== undefined;
    if (shouldStopPolling) {
      scheduler.clearInterval(poll);
      poll = undefined;
    }
  }

  return async function fetchOnUiThread(input: RequestInfo | URL, init?: RequestInit) {
    const request = new Request(input, init);
    const hasBody = request.method !== "GET" && request.method !== "HEAD";
    const body = hasBody ? await request.arrayBuffer() : undefined;
    helper ??= createHelper();
    const id = nextId;
    nextId += 1;
    const port = helper;
    return new Promise<Response>((resolve, reject) => {
      pending.set(id, {
        resolve,
        reject
      });
      request.signal.addEventListener("abort", () => {
        port.postMessage({
          type: "abort",
          id
        });
        const entry = pending.get(id);
        pending.delete(id);
        entry?.reject(request.signal.reason);
        entry?.body?.error(request.signal.reason);
      }, { once: true });
      port.postMessage({
        id,
        url: request.url,
        init: {
          method: request.method,
          headers: [...request.headers],
          body,
          redirect: request.redirect
        }
      }, body === undefined ? [] : [body]);
      poll ??= scheduler.setInterval(drain, POLL_MILLISECONDS);
    });
  };
}

let shared: ReturnType<typeof createUiFetch> | undefined;

/**
 * The `fetch` that settles on the UI thread: the request runs in a helper
 * thread, started on first use, and its answer is read back on a timer. The
 * response body streams. `blob:` URLs and request bodies that are streams are
 * not supported (a body is read whole first).
 */
// eslint-disable-next-line no-restricted-syntax -- mirrors the positional signature of the web's fetch
function uiFetch(input: RequestInfo | URL, init?: RequestInit) {
  shared ??= createUiFetch();
  return shared(input, init);
}

/** Makes `uiFetch` the thread's global `fetch`; `runOnUiThread` calls it. */
export function installUiFetch() {
  Object.assign(globalThis, { fetch: uiFetch });
}
