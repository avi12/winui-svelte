import { waitForCoreWebView2 } from "./core.ts";
import type { CoreWebView2Like, WebView2Like } from "./core.ts";
import type { Frame } from "#src/messaging/frame.js";
import { jsonSchema } from "#src/messaging/json.js";
import type { Transport } from "#src/state/transports/transport.js";

/** The link to a page, as `webView2Transport` returns it. */
export interface WebView2Transport extends Transport<Frame> {
  /**
   * Stops listening, drops what was waiting to be sent and tells the
   * listener the link is closed; sending after it does nothing.
   */
  dispose(): void;
}

function originOf(source: string) {
  try {
    return new URL(source).origin;
  } catch {
    return source;
  }
}

function messageOf(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}

/**
 * A messaging transport to the page in a WebView2 control, over
 * `PostWebMessageAsJson` and `WebMessageReceived`: pass it to
 * `defineMessaging`, and the page answers with `createPageTransport()` from
 * `winui-svelte/messaging/page`
 *
 * It waits for the control's browser to start; a frame sent before that is
 * kept and posted, in order, once it is ready
 * Host objects stay off (`AreHostObjectsAllowed`), and what arrives is parsed
 * as JSON and checked against `allowedOrigins`, never evaluated
 *
 * `allowedOrigins` lists the origins (`https://example.com`) whose messages
 * are accepted; a message from any other page is dropped and reported as
 * malformed
 * Absent, every page the control loads is trusted, which suits only content
 * the app ships; set it whenever the control can reach a page the app does
 * not own
 */
export function webView2Transport({ control, allowedOrigins }: {
  control: WebView2Like;
  allowedOrigins?: readonly string[];
}) {
  const allowed = allowedOrigins === undefined ? undefined : new Set(allowedOrigins);
  const queue: string[] = [];
  let core: CoreWebView2Like | undefined;
  let listener: Parameters<Transport<Frame>["listen"]>[0] | undefined;
  let unsubscribe: (() => void) | undefined;
  let isStarted = false;
  let isDisposed = false;

  function receive({ source, webMessageAsJson }: {
    source: string;
    webMessageAsJson: string;
  }) {
    const isRejected = allowed !== undefined && !allowed.has(originOf(source));
    if (isRejected) {
      listener?.malformed(`a message from ${source} is not from an allowed origin`);
      return;
    }

    try {
      listener?.message(jsonSchema.parse(JSON.parse(webMessageAsJson)));
    } catch (error) {
      listener?.malformed(messageOf(error));
    }
  }

  async function start() {
    const ready = await waitForCoreWebView2(control);
    if (isDisposed) {
      return;
    }

    ready.settings.areHostObjectsAllowed = false;
    core = ready;
    unsubscribe = ready.onWebMessageReceived((_sender, args) => receive(args));
    for (const text of queue.splice(0)) {
      ready.postWebMessageAsJson(text);
    }
  }

  function ensureStarted() {
    if (isStarted) {
      return;
    }

    isStarted = true;
    start().catch(error => {
      listener?.malformed(messageOf(error));
      listener?.closed();
    });
  }

  const transport: WebView2Transport = {
    send(frame) {
      if (isDisposed) {
        return;
      }

      const text = JSON.stringify(frame);
      const isWaiting = core === undefined;
      if (isWaiting) {
        queue.push(text);
        ensureStarted();
        return;
      }

      core?.postWebMessageAsJson(text);
    },
    listen(next) {
      listener = next;
      ensureStarted();
      return () => {
        listener = undefined;
      };
    },
    dispose() {
      if (isDisposed) {
        return;
      }

      isDisposed = true;
      queue.length = 0;
      unsubscribe?.();
      listener?.closed();
      listener = undefined;
    }
  };
  return transport;
}
