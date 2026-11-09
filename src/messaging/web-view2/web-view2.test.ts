import { deleteCookie, getCookies, setCookie } from "./cookies.ts";
import type {
  CookieLike,
  CoreWebView2Like,
  DownloadArguments,
  NavigationArguments,
  PermissionArguments,
  WebMessageArguments,
  WebResourceRequestedArguments,
  WebView2Like
} from "./core.ts";
import { addDocumentCreatedScript, executeScript } from "./core.ts";
import { startWebView2 } from "./environment.ts";
import { dispatchKey, dispatchMouseClick, TypeMode, typeText } from "./input.ts";
import { onDownloadStarting, onNavigationStarting, onPermissionRequested, PermissionState } from "./policy.ts";
import { callDevToolsMethod, onDevToolsEvent } from "./protocol.ts";
import { ResourceContext, subscribeRequests } from "./requests.ts";
import type { BodyStreams } from "./requests.ts";
import { webView2Transport } from "./transport.ts";
import { defineMessaging } from "#src/messaging/messaging.js";
import { createPageTransport } from "#src/messaging/page.js";
import type { PageWebView } from "#src/messaging/page.js";
import type { ProtocolWithReturn } from "#src/messaging/protocol-map.js";
import assert from "node:assert/strict";
import { test } from "node:test";

// The host side over a fake CoreWebView2, the page side over a fake
// window.chrome.webview, joined back to back.

interface PingProtocol {
  ping: ProtocolWithReturn<{ name: string }, string>;
}

function fakeCookie(name: string) {
  const cookie: CookieLike = {
    name,
    domain: "example.com",
    path: "/",
    isSession: true,
    value: "",
    expires: -1,
    isHttpOnly: false,
    isSecure: false,
    sameSite: 1
  };
  return cookie;
}

function fakeCore() {
  const posted: string[] = [];
  const handlers = {
    message: new Set<(sender: unknown, args: WebMessageArguments) => void>(),
    navigation: new Set<(sender: unknown, args: NavigationArguments) => void>(),
    download: new Set<(sender: unknown, args: DownloadArguments) => void>(),
    permission: new Set<(sender: unknown, args: PermissionArguments) => void>(),
    resource: new Set<(sender: unknown, args: WebResourceRequestedArguments) => void>(),
    protocolEvent: new Set<(sender: unknown, args: {
      parameterObjectAsJson: string;
    }) => void>()
  };
  const protocolCalls: Array<{
    method: string;
    parameters: string;
  }> = [];
  const responses: Array<{
    statusCode: number;
    reasonPhrase: string;
    headers: string;
  }> = [];
  const cookies: CookieLike[] = [];
  const calls: string[] = [];
  const settings = { areHostObjectsAllowed: true };
  const core: CoreWebView2Like = {
    settings,
    cookieManager: {
      getCookiesAsync: () => Promise.resolve({ toArray: () => cookies }),
      createCookie: name => fakeCookie(name),
      addOrUpdateCookie: cookie => cookies.push(cookie),
      deleteCookiesWithDomainAndPath: name => calls.push(`delete ${name}`),
      deleteAllCookies: () => calls.push("delete all")
    },
    postWebMessageAsJson: text => posted.push(text),
    executeScriptAsync: code => Promise.resolve(code === "throws" ? "not json{" : JSON.stringify({ ran: code })),
    addScriptToExecuteOnDocumentCreatedAsync: () => Promise.resolve("script-1"),
    removeScriptToExecuteOnDocumentCreated: id => calls.push(`remove ${id}`),
    openDevToolsWindow: () => calls.push("devtools"),
    browserProcessId: 1,
    environment: {
      userDataFolder: "folder",
      createCoreWebView2ControllerOptions: () => ({
        profileName: "",
        isInPrivateModeEnabled: false
      }),
      createWebResourceResponse(_content, statusCode, reasonPhrase, headers) {
        const response = {
          statusCode,
          reasonPhrase,
          headers
        };
        responses.push(response);
        return response;
      }
    },
    addWebResourceRequestedFilter: (uri, context) => calls.push(`add ${uri} ${context}`),
    removeWebResourceRequestedFilter: (uri, context) => calls.push(`remove ${uri} ${context}`),
    callDevToolsProtocolMethodAsync(method, parameters) {
      protocolCalls.push({
        method,
        parameters
      });
      return method === "Fails.method" ? Promise.reject(new Error("no such method")) : Promise.resolve(JSON.stringify({ method }));
    },
    getDevToolsProtocolEventReceiver: () => ({
      onDevToolsProtocolEventReceived(callback) {
        handlers.protocolEvent.add(callback);
        return () => handlers.protocolEvent.delete(callback);
      }
    }),
    onWebResourceRequested(callback) {
      handlers.resource.add(callback);
      return () => handlers.resource.delete(callback);
    },
    onWebMessageReceived(callback) {
      handlers.message.add(callback);
      return () => handlers.message.delete(callback);
    },
    onNavigationStarting(callback) {
      handlers.navigation.add(callback);
      return () => handlers.navigation.delete(callback);
    },
    onDownloadStarting(callback) {
      handlers.download.add(callback);
      return () => handlers.download.delete(callback);
    },
    onPermissionRequested(callback) {
      handlers.permission.add(callback);
      return () => handlers.permission.delete(callback);
    }
  };
  return {
    core,
    posted,
    handlers,
    cookies,
    calls,
    settings,
    protocolCalls,
    responses
  };
}

function fakeControl({ isReady = true } = {}) {
  const fake = fakeCore();
  const gate = Promise.withResolvers<void>();
  if (isReady) {
    gate.resolve();
  }

  const control: WebView2Like = {
    coreWebView2: fake.core,
    ensureCoreWebView2Async: () => gate.promise
  };
  return {
    ...fake,
    control,
    finish: gate.resolve
  };
}

function deliver({ handlers, source, value }: {
  handlers: ReturnType<typeof fakeCore>["handlers"];
  source: string;
  value: string;
}) {
  for (const handler of handlers.message) {
    handler(undefined, {
      source,
      webMessageAsJson: value
    });
  }
}

function tick() {
  return new Promise<void>(resolve => setImmediate(resolve));
}

test("a frame sent before the browser is ready is posted, in order, once it is", async () => {
  const { control, posted, finish } = fakeControl({ isReady: false });
  const transport = webView2Transport({ control });
  transport.send({
    id: 1,
    type: "a"
  });
  transport.send({
    id: 2,
    type: "b"
  });
  await tick();
  assert.deepEqual(posted, []);
  finish();
  await tick();
  assert.deepEqual(posted.map(text => JSON.parse(text).id), [1, 2]);
  transport.send({
    id: 3,
    type: "c"
  });
  assert.equal(posted.length, 3);
});

test("host objects are switched off once the browser is ready", async () => {
  const { control, settings } = fakeControl();
  const transport = webView2Transport({ control });
  transport.listen({
    message() {},
    malformed() {},
    closed() {}
  });
  await tick();
  assert.equal(settings.areHostObjectsAllowed, false);
});

test("a page and the host answer each other through messaging", async () => {
  const { control, handlers, posted } = fakeControl();
  const host = defineMessaging<PingProtocol>({ transport: webView2Transport({ control }) });
  const pageListeners = new Set<(event: { data: unknown }) => void>();
  const page: PageWebView = {
    postMessage: message => deliver({
      handlers,
      source: "https://app.example/page",
      value: JSON.stringify(message)
    }),
    addEventListener: (_type, listener) => pageListeners.add(listener),
    removeEventListener: (_type, listener) => pageListeners.delete(listener)
  };
  const pageSide = defineMessaging<PingProtocol>({ transport: createPageTransport(page) });
  pageSide.onMessage("ping", message => `hello ${message.data.name}`);
  const answer = host.sendMessage("ping", { name: "page" });
  await tick();
  for (const text of posted.splice(0)) {
    for (const listener of pageListeners) {
      listener({ data: JSON.parse(text) });
    }
  }

  assert.equal(await answer, "hello page");
});

test("a message from an origin outside allowedOrigins is dropped and reported", async () => {
  const { control, handlers } = fakeControl();
  const transport = webView2Transport({
    control,
    allowedOrigins: ["https://app.example"]
  });
  const received: unknown[] = [];
  const rejected: string[] = [];
  transport.listen({
    message: value => received.push(value),
    malformed: reason => rejected.push(reason),
    closed() {}
  });
  await tick();
  deliver({
    handlers,
    source: "https://evil.example/x",
    value: "{\"id\":1,\"type\":\"a\"}"
  });
  deliver({
    handlers,
    source: "https://app.example/page?x=1",
    value: "{\"id\":2,\"type\":\"a\"}"
  });
  assert.equal(received.length, 1);
  assert.equal(rejected.length, 1);
  assert.match(rejected[0] ?? "", /allowed origin/);
});

test("a message that is not JSON is reported and never evaluated", async () => {
  const { control, handlers } = fakeControl();
  const transport = webView2Transport({ control });
  const rejected: string[] = [];
  transport.listen({
    message() {},
    malformed: reason => rejected.push(reason),
    closed() {}
  });
  await tick();
  deliver({
    handlers,
    source: "about:blank",
    value: "alert(1)"
  });
  assert.equal(rejected.length, 1);
});

test("dispose unsubscribes, drops the queue, closes the listener and stops sending", async () => {
  const { control, handlers, posted, finish } = fakeControl({ isReady: false });
  const transport = webView2Transport({ control });
  let isClosed = false;
  transport.listen({
    message() {},
    malformed() {},
    closed() {
      isClosed = true;
    }
  });
  transport.send({
    id: 1,
    type: "a"
  });
  transport.dispose();
  finish();
  await tick();
  assert.equal(isClosed, true);
  assert.deepEqual(posted, []);
  assert.equal(handlers.message.size, 0);
  transport.send({
    id: 2,
    type: "b"
  });
  assert.deepEqual(posted, []);
});

test("a browser that cannot start closes the link", async () => {
  const closed: string[] = [];
  const transport = webView2Transport({
    control: {
      coreWebView2: fakeCore().core,
      ensureCoreWebView2Async: () => Promise.reject(new Error("0x8007139F"))
    }
  });
  transport.listen({
    message() {},
    malformed: reason => closed.push(reason),
    closed: () => closed.push("closed")
  });
  await tick();
  assert.deepEqual(closed, ["0x8007139F", "closed"]);
});

test("executeScript parses the page's JSON and rejects what is not", async () => {
  const { control } = fakeControl();
  assert.deepEqual(
    await executeScript({
      control,
      code: "1"
    }), { ran: "1" }
  );
  await assert.rejects(
    executeScript({
      control,
      code: "throws"
    })
  );
});

test("a document created script is removed by the function it resolves with", async () => {
  const { control, calls } = fakeControl();
  const remove = await addDocumentCreatedScript({
    control,
    code: "1"
  });
  remove();
  assert.deepEqual(calls, ["remove script-1"]);
});

test("cookies are set, read as plain data and deleted", async () => {
  const { control, cookies, calls } = fakeControl();
  await setCookie({
    control,
    cookie: {
      name: "session",
      value: "abc",
      domain: "example.com",
      sameSite: "strict",
      isSecure: true,
      expires: 4_000_000_000
    }
  });
  assert.equal(cookies[0]?.sameSite, 2);
  const [cookie] = await getCookies({
    control,
    uri: "https://example.com"
  });
  assert.equal(cookie?.name, "session");
  assert.equal(cookie?.sameSite, "strict");
  await deleteCookie({
    control,
    name: "session",
    domain: "example.com"
  });
  assert.deepEqual(calls, ["delete session"]);
});

test("a permission request is answered with the state decide returns", async () => {
  const { control, handlers } = fakeControl();
  const stop = await onPermissionRequested({
    control,
    decide: request => request.kind === "camera" ? PermissionState.DENY : PermissionState.ALLOW
  });
  const args: PermissionArguments = {
    uri: "https://app.example",
    permissionKind: 2,
    isUserInitiated: true,
    state: 0,
    handled: false,
    savesInProfile: false
  };
  for (const handler of handlers.permission) {
    handler(undefined, args);
  }

  assert.equal(args.state, 2);
  assert.equal(args.handled, true);
  stop();
  assert.equal(handlers.permission.size, 0);
});

test("a download is handled with the path chosen, or cancelled", async () => {
  const { control, handlers } = fakeControl();
  await onDownloadStarting({
    control,
    pathFor: ({ uri }) => uri.endsWith(".exe") ? null : "C:\\Downloads\\file.bin"
  });
  const allowed: DownloadArguments = {
    downloadOperation: {
      uri: "https://x/a.bin"
    },
    cancel: false,
    handled: false,
    resultFilePath: ""
  };
  const refused: DownloadArguments = {
    downloadOperation: {
      uri: "https://x/a.exe"
    },
    cancel: false,
    handled: false,
    resultFilePath: ""
  };
  for (const handler of handlers.download) {
    handler(undefined, allowed);
    handler(undefined, refused);
  }

  assert.equal(allowed.handled, true);
  assert.equal(allowed.resultFilePath, "C:\\Downloads\\file.bin");
  assert.equal(refused.cancel, true);
});

test("a navigation isAllowed refuses is cancelled", async () => {
  const { control, handlers } = fakeControl();
  await onNavigationStarting({
    control,
    isAllowed: ({ uri }) => uri.startsWith("https://app.example")
  });
  const inside: NavigationArguments = {
    uri: "https://app.example/x",
    isUserInitiated: true,
    cancel: false
  };
  const outside: NavigationArguments = {
    uri: "https://other.example",
    isUserInitiated: true,
    cancel: false
  };
  for (const handler of handlers.navigation) {
    handler(undefined, inside);
    handler(undefined, outside);
  }

  assert.equal(inside.cancel, false);
  assert.equal(outside.cancel, true);
});

const FAKE_STREAMS: BodyStreams = {
  empty: () => "empty",
  of: () => Promise.resolve("bytes")
};

function resourceArguments({ uri, resourceContext = 0 }: {
  uri: string;
  resourceContext?: number;
}) {
  const args: WebResourceRequestedArguments = {
    request: {
      uri,
      method: "GET"
    },
    resourceContext,
    response: undefined,
    getDeferral: () => ({ complete: () => undefined })
  };
  return args;
}

test("a handler adds the filter once, answers the matches with an empty 204 and removes both", async () => {
  const { control, handlers, calls, responses } = fakeControl();
  const unblock = await subscribeRequests({
    control,
    filters: [{
      uri: "https://accounts.example/Rotate*",
      context: ResourceContext.FETCH
    }],
    respond: () => ({ statusCode: 204 }),
    streams: FAKE_STREAMS
  });
  assert.deepEqual(calls, ["add https://accounts.example/Rotate* 8"]);

  const matching = resourceArguments({
    uri: "https://accounts.example/RotateCookies?x=1",
    resourceContext: 8
  });
  const otherContext = resourceArguments({
    uri: "https://accounts.example/RotateCookies",
    resourceContext: 1
  });
  const otherUri = resourceArguments({
    uri: "https://accounts.example/other",
    resourceContext: 8
  });
  for (const handler of handlers.resource) {
    handler(undefined, matching);
    handler(undefined, otherContext);
    handler(undefined, otherUri);
  }

  assert.deepEqual(responses, [{
    statusCode: 204,
    reasonPhrase: "No Content",
    headers: ""
  }]);
  assert.notEqual(matching.response, undefined);
  assert.equal(otherContext.response, undefined);
  assert.equal(otherUri.response, undefined);
  unblock();
  assert.equal(handlers.resource.size, 0);
  assert.deepEqual(calls.slice(1), ["remove https://accounts.example/Rotate* 8"]);
});

test("a respond that returns null lets the request through, a body holds it until written", async () => {
  const { control, handlers, responses } = fakeControl();
  await subscribeRequests({
    control,
    streams: FAKE_STREAMS,
    filters: [{ uri: "https://example.com/*" }],
    respond: request => request.uri.endsWith("/ads") ? null : {
      statusCode: 200,
      headers: {
        "Content-Type": "text/plain",
        "X-A": "b"
      },
      body: "hi"
    }
  });
  const passed = resourceArguments({ uri: "https://example.com/ads" });
  const held = resourceArguments({ uri: "https://example.com/page" });
  let isCompleted = false;
  held.getDeferral = () => ({
    complete() {
      isCompleted = true;
    }
  });
  for (const handler of handlers.resource) {
    handler(undefined, passed);
    handler(undefined, held);
  }

  assert.equal(passed.response, undefined);
  assert.equal(held.response, undefined);
  await new Promise(resolve => setTimeout(resolve, 200));
  assert.equal(isCompleted, true);
  assert.deepEqual(responses, [{
    statusCode: 200,
    reasonPhrase: "OK",
    headers: "Content-Type: text/plain\r\nX-A: b"
  }]);
});

test("a protocol method is called with JSON parameters, parsed, and an error rejects with its text", async () => {
  const { control, protocolCalls } = fakeControl();
  const result = await callDevToolsMethod({
    control,
    method: "Runtime.evaluate",
    parameters: {
      expression: "1"
    }
  });
  assert.deepEqual(result, { method: "Runtime.evaluate" });
  assert.deepEqual(protocolCalls, [{
    method: "Runtime.evaluate",
    parameters: "{\"expression\":\"1\"}"
  }]);
  await assert.rejects(
    callDevToolsMethod({
      control,
      method: "Fails.method"
    }), /Fails\.method: no such method/
  );
});

test("a protocol event reaches the handler as parsed JSON until it is unsubscribed", async () => {
  const { control, handlers } = fakeControl();
  const seen: unknown[] = [];
  const off = await onDevToolsEvent({
    control,
    event: "Network.requestWillBeSent",
    handler: parameters => seen.push(parameters)
  });
  for (const handler of handlers.protocolEvent) {
    handler(undefined, { parameterObjectAsJson: "{\"id\":\"1\"}" });
  }

  assert.deepEqual(seen, [{ id: "1" }]);
  off();
  assert.equal(handlers.protocolEvent.size, 0);
});

test("keys, clicks and typed text are built as Input protocol calls", async () => {
  const { control, protocolCalls } = fakeControl();
  await dispatchKey({
    control,
    key: "a",
    type: "keyDown"
  });
  await dispatchKey({
    control,
    key: "a",
    type: "keyUp"
  });
  await dispatchMouseClick({
    control,
    x: 5,
    y: 6
  });
  assert.deepEqual(protocolCalls.map(call => [call.method, JSON.parse(call.parameters)]), [
    ["Input.dispatchKeyEvent", {
      type: "keyDown",
      key: "a",
      modifiers: 0,
      text: "a"
    }],
    ["Input.dispatchKeyEvent", {
      type: "keyUp",
      key: "a",
      modifiers: 0
    }],
    ["Input.dispatchMouseEvent", {
      type: "mousePressed",
      x: 5,
      y: 6,
      button: "left",
      clickCount: 1
    }],
    ["Input.dispatchMouseEvent", {
      type: "mouseReleased",
      x: 5,
      y: 6,
      button: "left",
      clickCount: 1
    }]
  ]);

  protocolCalls.length = 0;
  await typeText({
    control,
    text: "hi"
  });
  assert.equal(protocolCalls.length, 4);

  protocolCalls.length = 0;
  await typeText({
    control,
    text: "hello",
    mode: TypeMode.INSERT_AFTER_FIRST
  });
  assert.deepEqual(protocolCalls.map(call => call.method), [
    "Input.dispatchKeyEvent",
    "Input.dispatchKeyEvent",
    "Input.insertText"
  ]);
  assert.deepEqual(JSON.parse(protocolCalls[2]?.parameters ?? ""), { text: "ello" });
});

test("startWebView2 passes the environment and the controller options, and starts once", async () => {
  const { core } = fakeCore();
  const started: Array<{
    environment: unknown;
    options: {
      profileName: string;
      isInPrivateModeEnabled: boolean;
    } | undefined;
  }> = [];
  const control: WebView2Like = {
    coreWebView2: core,
    ensureCoreWebView2Async(environment?: unknown, options?: {
      profileName: string;
      isInPrivateModeEnabled: boolean;
    }) {
      started.push({
        environment,
        options
      });
      return Promise.resolve();
    }
  };
  const first = await startWebView2({
    control,
    environment: core.environment,
    profileName: "home",
    isInPrivateMode: true
  });
  const second = await startWebView2({
    control,
    environment: core.environment
  });
  assert.equal(first, core);
  assert.equal(second, core);
  assert.equal(started.length, 1);
  assert.equal(started[0]?.environment, core.environment);
  assert.deepEqual(started[0]?.options, {
    profileName: "home",
    isInPrivateModeEnabled: true
  });
});

test("startWebView2 names both causes of 0x8007139F and lets a later call retry", async () => {
  const { core } = fakeCore();
  let attempts = 0;
  const control: WebView2Like = {
    coreWebView2: core,
    ensureCoreWebView2Async() {
      attempts += 1;
      return attempts === 1 ? Promise.reject(new Error("HRESULT 0x8007139F")) : Promise.resolve();
    }
  };
  await assert.rejects(
    startWebView2({
      control,
      environment: core.environment
    }), /ordinary desktop session.*different environment options/
  );
  assert.equal(
    await startWebView2({
      control,
      environment: core.environment
    }), core
  );
});
