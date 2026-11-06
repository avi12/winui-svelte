import type { Frame } from "./frame.ts";
import { jsonSchema } from "./json.ts";
import type { Transport } from "#src/state/transports/transport.js";
import { z } from "zod";

// The web page's end of the link to the host: nothing here touches WinUI, so
// a browser bundle takes it.

export type { RequestFrame, ResponseFrame } from "./frame.ts";
export { defineMessaging } from "./messaging.ts";

/** The part of the page's `window.chrome.webview` this transport uses. */
export interface PageWebView {
  postMessage(message: unknown): void;
  addEventListener(type: "message", listener: (event: { data: unknown }) => void): void;
  removeEventListener(type: "message", listener: (event: { data: unknown }) => void): void;
}

const globalSchema = z.object({
  chrome: z.object({
    webview: z.custom<PageWebView>(value => typeof value === "object" && value !== null && "postMessage" in value)
  })
});

/**
 * The `window.chrome.webview` WebView2 injects into every page it loads;
 * throws in a page that is not in a WebView2.
 */
export function hostWebView() {
  return globalSchema.parse(globalThis).chrome.webview;
}

/**
 * The page's transport to the host app: pass it to `defineMessaging`, and the
 * host answers with `webView2Transport(control)` from
 * `winui-svelte/messaging/web-view2`
 *
 * `webview` defaults to the page's `window.chrome.webview`, which WebView2
 * injects into every page, so no script has to be added; outside a WebView2
 * (a browser tab, a test) pass a stand-in
 */
export function createPageTransport(webview: PageWebView = hostWebView()) {
  const transport: Transport<Frame> = {
    send(frame) {
      webview.postMessage(frame);
    },
    listen(listener) {
      function receive(event: { data: unknown }) {
        const result = jsonSchema.safeParse(event.data);
        if (!result.success) {
          listener.malformed(result.error.message);
          return;
        }

        listener.message(result.data);
      }

      webview.addEventListener("message", receive);
      return () => webview.removeEventListener("message", receive);
    }
  };
  return transport;
}
