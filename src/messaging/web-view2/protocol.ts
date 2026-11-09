import { messageOf, waitForCoreWebView2 } from "./core.ts";
import type { WebView2Like } from "./core.ts";
import { jsonSchema } from "#src/messaging/json.js";
import type { Json } from "#src/messaging/json.js";

/**
 * Calls a DevTools protocol method on the page and resolves with its result
 * as JSON, checked; rejects with the protocol's error text
 */
export async function callDevToolsMethod({ control, method, parameters = {} }: {
  control: WebView2Like;
  method: string;
  parameters?: Readonly<Record<string, unknown>>;
}) {
  const core = await waitForCoreWebView2(control);
  try {
    const text = await core.callDevToolsProtocolMethodAsync(method, JSON.stringify(parameters));
    return jsonSchema.parse(JSON.parse(text));
  } catch (error) {
    throw new Error(`${method}: ${messageOf(error)}`, { cause: error });
  }
}

/**
 * Hands the parameters of every `event` of the DevTools protocol to `handler`
 * as JSON, checked; resolves with the function that stops it
 * The browser raises an event only after its domain is enabled
 * (`callDevToolsMethod({ method: "Network.enable" })`), and an event still
 * subscribed keeps the process from exiting
 */
export async function onDevToolsEvent({ control, event, handler }: {
  control: WebView2Like;
  event: string;
  handler(parameters: Json): void;
}) {
  const core = await waitForCoreWebView2(control);
  const receiver = core.getDevToolsProtocolEventReceiver(event);
  return receiver.onDevToolsProtocolEventReceived((_sender, args) => {
    handler(jsonSchema.parse(JSON.parse(args.parameterObjectAsJson)));
  });
}
