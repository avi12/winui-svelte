import { waitForCoreWebView2 } from "./core.ts";
import type { WebResourceRequestedArguments, WebView2Like } from "./core.ts";
import { streamOf } from "#src/components/byte-stream.js";
import { CoreWebView2WebResourceContext } from "#winui/microsoft/web/web-view2/core/CoreWebView2WebResourceContext";
import { InMemoryRandomAccessStream } from "#winui/windows/storage/streams/InMemoryRandomAccessStream";

/** What kind of request a filter matches. */
export const ResourceContext = {
  ALL: "all",
  DOCUMENT: "document",
  STYLESHEET: "stylesheet",
  IMAGE: "image",
  MEDIA: "media",
  FONT: "font",
  SCRIPT: "script",
  XML_HTTP_REQUEST: "xmlHttpRequest",
  FETCH: "fetch",
  TEXT_TRACK: "textTrack",
  EVENT_SOURCE: "eventSource",
  WEBSOCKET: "websocket",
  MANIFEST: "manifest",
  SIGNED_EXCHANGE: "signedExchange",
  PING: "ping",
  CSP_VIOLATION_REPORT: "cspViolationReport",
  OTHER: "other"
} as const;
/** One of the values of `ResourceContext`. */
export type ResourceContext = (typeof ResourceContext)[keyof typeof ResourceContext];

const CONTEXTS = new Map<ResourceContext, number>([
  [ResourceContext.ALL, CoreWebView2WebResourceContext.All],
  [ResourceContext.DOCUMENT, CoreWebView2WebResourceContext.Document],
  [ResourceContext.STYLESHEET, CoreWebView2WebResourceContext.Stylesheet],
  [ResourceContext.IMAGE, CoreWebView2WebResourceContext.Image],
  [ResourceContext.MEDIA, CoreWebView2WebResourceContext.Media],
  [ResourceContext.FONT, CoreWebView2WebResourceContext.Font],
  [ResourceContext.SCRIPT, CoreWebView2WebResourceContext.Script],
  [ResourceContext.XML_HTTP_REQUEST, CoreWebView2WebResourceContext.XmlHttpRequest],
  [ResourceContext.FETCH, CoreWebView2WebResourceContext.Fetch],
  [ResourceContext.TEXT_TRACK, CoreWebView2WebResourceContext.TextTrack],
  [ResourceContext.EVENT_SOURCE, CoreWebView2WebResourceContext.EventSource],
  [ResourceContext.WEBSOCKET, CoreWebView2WebResourceContext.Websocket],
  [ResourceContext.MANIFEST, CoreWebView2WebResourceContext.Manifest],
  [ResourceContext.SIGNED_EXCHANGE, CoreWebView2WebResourceContext.SignedExchange],
  [ResourceContext.PING, CoreWebView2WebResourceContext.Ping],
  [ResourceContext.CSP_VIOLATION_REPORT, CoreWebView2WebResourceContext.CspViolationReport],
  [ResourceContext.OTHER, CoreWebView2WebResourceContext.Other]
]);

const ALL_CONTEXTS = CoreWebView2WebResourceContext.All;

/** The status codes a block or a canned answer uses. */
export const StatusCode = {
  OK: 200,
  NO_CONTENT: 204,
  FORBIDDEN: 403,
  NOT_FOUND: 404
} as const;
const REASON_PHRASES = new Map<number, string>([
  [StatusCode.OK, "OK"],
  [StatusCode.NO_CONTENT, "No Content"],
  [StatusCode.FORBIDDEN, "Forbidden"],
  [StatusCode.NOT_FOUND, "Not Found"]
]);
const REGEXP_SPECIALS = /[$()+.[\\\]^{|}]/g;

/** Which requests a handler wants: a URI pattern (`*` and `?` are wildcards) of one kind. */
export interface RequestFilter {
  readonly uri: string;
  readonly context?: ResourceContext;
}

/** A request about to be sent. */
export interface WebRequest {
  readonly uri: string;
  readonly method: string;
}

/** What answers a request instead of the network. */
export interface WebResponse {
  /** Defaults to 200. */
  readonly statusCode?: number;
  readonly reasonPhrase?: string;
  readonly headers?: Readonly<Record<string, string>>;

  /** Text is sent as UTF-8; no body is an empty one. */
  readonly body?: string | Uint8Array;
}

function patternOf(uri: string) {
  const escaped = uri.replaceAll(REGEXP_SPECIALS, String.raw`\$&`);
  return new RegExp(`^${escaped.replaceAll("*", ".*").replaceAll("?", ".")}$`, "i");
}

function contextNumberOf(context: ResourceContext) {
  return CONTEXTS.get(context) ?? ALL_CONTEXTS;
}

/**
 * The filters are the browser's: a handler hears every filter of the control,
 * so each one checks its own.
 */
function isWanted({ filters, uri, context }: {
  filters: readonly RequestFilter[];
  uri: string;
  context: number;
}) {
  return filters.some(filter => {
    const filterContext = contextNumberOf(filter.context ?? ResourceContext.ALL);
    const isContextMatching = filterContext === ALL_CONTEXTS || filterContext === context;
    return isContextMatching && patternOf(filter.uri).test(uri);
  });
}

function headerLinesOf(headers: Readonly<Record<string, string>> | undefined) {
  return Object.entries(headers ?? {}).map(([name, value]) => `${name}: ${value}`).join("\r\n");
}

function bytesOfBody(body: string | Uint8Array) {
  return typeof body === "string" ? new TextEncoder().encode(body) : body;
}

/** Where a response body lives: WinRT streams, or a fake in a test. */
export interface BodyStreams {
  empty(): unknown;
  of(bytes: Uint8Array): Promise<unknown>;
}

const WINRT_STREAMS: BodyStreams = {
  empty: () => new InMemoryRandomAccessStream(),
  of: bytes => streamOf(bytes)
};

/**
 * Answers the requests that match `filters` with what `respond` returns, and
 * lets the others (and a `null`) go to the network; resolves with the function
 * that removes the handler and the filters
 * `respond` must be a plain function: the answer is given before the event's
 * handler returns, except a body, which is written to a stream first and
 * holds the request meanwhile
 * A filter added before the first navigation applies to it; one added later
 * does not apply to requests already in flight
 */
export function onWebResourceRequested({ control, filters, respond }: {
  control: WebView2Like;
  filters: readonly RequestFilter[];
  respond(request: WebRequest): WebResponse | null;
}) {
  return subscribeRequests({
    control,
    filters,
    respond,
    streams: WINRT_STREAMS
  });
}

/** `onWebResourceRequested` over any body streams; the unit tests'. */
export async function subscribeRequests({ control, filters, respond, streams }: {
  control: WebView2Like;
  filters: readonly RequestFilter[];
  respond(request: WebRequest): WebResponse | null;
  streams: BodyStreams;
}) {
  const core = await waitForCoreWebView2(control);
  function answer({ args, response }: {
    args: WebResourceRequestedArguments;
    response: WebResponse;
  }) {
    const statusCode = response.statusCode ?? StatusCode.OK;
    const reasonPhrase = response.reasonPhrase ?? REASON_PHRASES.get(statusCode) ?? "";
    const headers = headerLinesOf(response.headers);
    const hasBody = response.body !== undefined && response.body.length > 0;
    if (!hasBody) {
      args.response = core.environment.createWebResourceResponse(streams.empty(), statusCode, reasonPhrase, headers);
      return;
    }

    const deferral = args.getDeferral();
    void streams.of(bytesOfBody(response.body ?? "")).then(stream => {
      args.response = core.environment.createWebResourceResponse(stream, statusCode, reasonPhrase, headers);
    }).finally(() => deferral.complete());
  }

  for (const filter of filters) {
    core.addWebResourceRequestedFilter(filter.uri, contextNumberOf(filter.context ?? ResourceContext.ALL));
  }

  const stopListening = core.onWebResourceRequested((_sender, args) => {
    const { uri, method } = args.request;
    const isMine = isWanted({
      filters,
      uri,
      context: args.resourceContext
    });
    if (!isMine) {
      return;
    }

    const response = respond({
      uri,
      method
    });
    const isAnswered = response !== null;
    if (isAnswered) {
      answer({
        args,
        response
      });
    }
  });
  return () => {
    stopListening();
    for (const filter of filters) {
      core.removeWebResourceRequestedFilter(filter.uri, contextNumberOf(filter.context ?? ResourceContext.ALL));
    }
  };
}

/**
 * Answers every request to `uri` (`*` and `?` are wildcards) with `statusCode`
 * and an empty body, until the returned function is called; the page sees a
 * response, not a network error
 */
export function blockRequests({ control, uri, context = ResourceContext.ALL, statusCode = StatusCode.NO_CONTENT }: {
  control: WebView2Like;
  uri: string;
  context?: ResourceContext;
  statusCode?: number;
}) {
  return onWebResourceRequested({
    control,
    filters: [{
      uri,
      context
    }],
    respond: () => ({ statusCode })
  });
}
