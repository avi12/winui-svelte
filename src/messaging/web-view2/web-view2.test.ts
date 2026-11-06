import { deleteCookie, getCookies, setCookie } from "./cookies.ts";
import type {
  CookieLike,
  CoreWebView2Like,
  DownloadArguments,
  NavigationArguments,
  PermissionArguments,
  WebMessageArguments,
  WebView2Like
} from "./core.ts";
import { addDocumentCreatedScript, executeScript } from "./core.ts";
import { onDownloadStarting, onNavigationStarting, onPermissionRequested, PermissionState } from "./policy.ts";
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
    permission: new Set<(sender: unknown, args: PermissionArguments) => void>()
  };
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
    settings
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
