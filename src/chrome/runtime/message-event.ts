import type { MessageSender } from "./port.ts";
import { ChromeEvent } from "#src/downloads/chrome-event.js";
import type { Json } from "#src/messaging/json.js";
import { jsonSchema } from "#src/messaging/json.js";
import { z } from "zod";

/** Answers the message; call it once, now or later (return `true` to say later). */
export type SendResponse = (response?: Json) => void;

/**
 * A `chrome.runtime.onMessage` listener. It answers by calling
 * `sendResponse` (and returning `true` when that happens later), or by
 * returning a promise of the answer; returning nothing leaves the message to
 * other listeners.
 */
export type MessageListener = (
  message: Json,
  sender: MessageSender,
  sendResponse: SendResponse
) => boolean | void | Promise<Json | void>;

/** What a context answers to `sendMessage`. */
export const replySchema = z.object({
  hasListeners: z.boolean(),
  isHandled: z.boolean(),
  hasResponse: z.boolean(),
  response: jsonSchema,
  error: z.string().nullable()
});

/** A reply, as `replySchema` parses it. */
export type Reply = z.infer<typeof replySchema>;

const SILENT = {
  isHandled: false,
  hasResponse: false,
  response: null,
  error: null
} satisfies Partial<Reply>;

const NO_LISTENERS = {
  ...SILENT,
  hasListeners: false
} satisfies Reply;

/** `chrome.runtime.onMessage`: listeners that may answer the message. */
export class MessageEvent extends ChromeEvent<MessageListener> {
  /**
   * Gives the message to every listener; the first answer wins.
   *
   * @param options - The message and who sent it.
   * @returns The reply: whether anyone listens, whether anyone answered, and
   *   the answer.
   */
  collect({ message, sender }: {
    message: Json;
    sender: MessageSender;
  }) {
    const listeners = [...this.listeners];
    const hasNoListeners = listeners.length === 0;
    if (hasNoListeners) {
      return Promise.resolve(NO_LISTENERS);
    }

    return new Promise<Reply>(resolve => {
      let isSettled = false;
      let silent = 0;

      function settle(reply: Reply) {
        if (isSettled) {
          return;
        }

        isSettled = true;
        resolve(reply);
      }

      function answer(response?: Json | void) {
        settle({
          ...SILENT,
          hasListeners: true,
          isHandled: true,
          hasResponse: response !== undefined,
          response: response ?? null
        });
      }

      function fail(error: unknown) {
        settle({
          ...SILENT,
          hasListeners: true,
          isHandled: true,
          error: error instanceof Error ? error.message : String(error)
        });
      }

      function stayedSilent() {
        silent += 1;
        const isEveryoneSilent = silent === listeners.length;
        if (isEveryoneSilent) {
          settle({
            ...SILENT,
            hasListeners: true
          });
        }
      }

      for (const listener of listeners) {
        try {
          const result = listener(message, sender, answer);
          const isPromise = result instanceof Promise;
          if (isPromise) {
            result.then(answer, fail);
          } else if (result !== true) {
            stayedSilent();
          }
        } catch (error) {
          queueMicrotask(() => {
            throw error;
          });
          stayedSilent();
        }
      }
    });
  }
}
