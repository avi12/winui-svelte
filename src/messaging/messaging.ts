import type { Frame, RequestFrame, ResponseFrame } from "./frame.ts";
import { requestFrameSchema, responseFrameSchema } from "./frame.ts";
import type { WireValue } from "./json.ts";
import type { GetReturnType, MessageHandler, RemoveListener, SendArguments } from "./protocol-map.ts";
import type { Transport } from "#src/state/transports/transport.js";

/**
 * What goes wrong at the messaging layer: a handler that threw (the sender
 * rejects with its message), a message nobody handles, a timeout, or a frame
 * that is not a message.
 */
export class MessagingError extends Error {
  override readonly name: string = "MessagingError";
}

/** What a pending `sendMessage` rejects with when the link closes first. */
export class MessagingClosedError extends MessagingError {
  override readonly name: string = "MessagingClosedError";

  constructor() {
    super("the link closed before the message was answered");
  }
}

/** How one end of a link reacts to what it cannot answer. */
export interface MessagingOptions {
  /** A request unanswered for this long rejects; unlimited when absent. */
  timeoutMilliseconds?: number;

  /**
   * A request whose type has no handler here is answered with an error; this
   * also reports it.
   */
  onUnhandled?(frame: RequestFrame): void;

  /** A frame that is neither a request nor a response, or a handler that threw. */
  onError?(error: Error): void;

  /** The current time for a request's timestamp. */
  now?(): number;

  /** The link closed: nothing more arrives, and what was waiting has been rejected. */
  onClosed?(): void;
}

/** One end of a link: the link's transport, and how that end reacts. */
export interface MessagingSetup extends MessagingOptions {
  transport: Transport<Frame>;
}

/** One end of a typed link, as `defineMessaging` returns it. */
export interface Messaging<TProtocolMap> {
  /**
   * Sends a message and resolves with what the other end's handler returns.
   * Rejects with what that handler threw, with a timeout, or when the link closes.
   */
  sendMessage<TType extends keyof TProtocolMap & string>(
    ...parameters: SendArguments<TProtocolMap, TType>
  ): Promise<GetReturnType<TProtocolMap[TType]>>;

  /**
   * Answers messages of one type. A type takes one handler; the returned
   * function removes it.
   */
  onMessage<TType extends keyof TProtocolMap & string>(
    type: TType,
    handler: MessageHandler<TProtocolMap, TType>
  ): RemoveListener;

  /**
   * Sends a message and does not wait for the answer. A link that is closed,
   * or closes before the other end answers, is no error: the other end is
   * gone and there is no one to tell, so nothing is left to reject unhandled.
   * Any other failure goes to `onError`.
   */
  notify<TType extends keyof TProtocolMap & string>(
    ...parameters: SendArguments<TProtocolMap, TType>
  ): void;

  /** Removes every handler, leaving the link open. */
  removeAllListeners(): void;

  /** Stops listening and rejects what is still waiting. */
  close(): void;
}

interface Pending {
  resolve(value: WireValue): void;
  reject(error: Error): void;
  timer: ReturnType<typeof setTimeout> | null;
}

/**
 * `defineExtensionMessaging` from webext-core for any link the state
 * channel's transports provide (stdio, a worker's MessagePort, memory):
 * `sendMessage(type, data)` resolves with what the other end's
 * `onMessage(type, handler)` returns, and rejects with what it threw.
 */
export function defineMessaging<TProtocolMap>({
  transport,
  now = Date.now,
  onError = () => {},
  onUnhandled = () => {},
  onClosed = () => {},
  timeoutMilliseconds
}: MessagingSetup) {
  const pending = new Map<number, Pending>();
  const handlers = new Map<string, (frame: RequestFrame) => WireValue | Promise<WireValue>>();
  let nextIdentifier = 0;
  let isClosed = false;

  function respond(frame: ResponseFrame) {
    transport.send(frame);
  }

  async function answer(request: RequestFrame) {
    const handler = handlers.get(request.type);
    const isHandled = handler !== undefined;
    if (!isHandled) {
      onUnhandled(request);
      respond({
        id: request.id,
        error: `no handler for message "${request.type}"`
      });
      return;
    }

    try {
      const response = await handler(request);
      respond({
        id: request.id,
        response: response === undefined ? null : response
      });
    } catch (error) {
      const failure = error instanceof Error ? error : new MessagingError(String(error));
      onError(failure);
      respond({
        id: request.id,
        error: failure.message
      });
    }
  }

  function clearTimer(waiting: Pending) {
    const { timer } = waiting;
    const isTimed = timer !== null;
    if (isTimed) {
      clearTimeout(timer);
    }
  }

  function settle(frame: ResponseFrame) {
    const waiting = pending.get(frame.id);
    const isWaiting = waiting !== undefined;
    if (!isWaiting) {
      return;
    }

    pending.delete(frame.id);
    clearTimer(waiting);

    const { error } = frame;
    const hasError = typeof error === "string";
    if (hasError) {
      waiting.reject(new MessagingError(error));
    } else {
      waiting.resolve(frame.response);
    }
  }

  function rejectAll(error: Error) {
    for (const waiting of pending.values()) {
      clearTimer(waiting);
      waiting.reject(error);
    }
    pending.clear();
  }

  const stop = transport.listen({
    message(value) {
      const request = requestFrameSchema.safeParse(value);
      const response = responseFrameSchema.safeParse(value);
      if (request.success) {
        void answer(request.data);
      } else if (response.success) {
        settle(response.data);
      } else {
        onError(new MessagingError(`not a message frame: ${JSON.stringify(value)}`));
      }
    },
    malformed(reason) {
      onError(new MessagingError(reason));
    },
    closed() {
      isClosed = true;
      rejectAll(new MessagingClosedError());
      onClosed();
    }
  });

  const messaging: Messaging<TProtocolMap> = {
    sendMessage(...parameters) {
      const [type, data] = parameters;
      if (isClosed) {
        return Promise.reject(new MessagingClosedError());
      }

      nextIdentifier += 1;
      const id = nextIdentifier;
      return new Promise((resolve, reject) => {
        const timer = timeoutMilliseconds === undefined
          ? null
          : setTimeout(() => {
            pending.delete(id);
            reject(new MessagingError(`no answer to message "${type}" in ${timeoutMilliseconds} ms`));
          }, timeoutMilliseconds);
        pending.set(id, {
          // The same trust as onMessage below: the answer is taken to be its
          // message's declared return type.
          // oxlint-disable-next-line typescript/consistent-type-assertions
          resolve: answer => resolve(answer as Parameters<typeof resolve>[0]),
          reject,
          timer
        });
        transport.send({
          id,
          type,
          data: data === undefined ? null : data,
          timestamp: now()
        });
      });
    },
    notify(...parameters) {
      void messaging.sendMessage(...parameters).catch((error: unknown) => {
        const isLinkClosed = error instanceof MessagingClosedError;
        if (isLinkClosed) {
          return;
        }

        onError(error instanceof Error ? error : new MessagingError(String(error)));
      });
    },
    onMessage(type, handler) {
      const hasHandler = handlers.has(type);
      if (hasHandler) {
        throw new MessagingError(`message "${type}" already has a handler`);
      }

      // The wire carries JSON the protocol map describes but cannot check: the
      // frame's data is taken to be its message's data, as webext-core does.
      // oxlint-disable-next-line typescript/consistent-type-assertions
      handlers.set(type, frame => handler(frame as Parameters<typeof handler>[0]));
      return () => {
        handlers.delete(type);
      };
    },
    removeAllListeners() {
      handlers.clear();
    },
    close() {
      isClosed = true;
      stop();
      handlers.clear();
      rejectAll(new MessagingClosedError());
    }
  };
  return messaging;
}
