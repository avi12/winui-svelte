import type { Port } from "./port.ts";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { test } from "node:test";

// chrome.runtime against in-memory links, a fake registry and a child process
// that echoes in the native messaging protocol.

const { Runtime } = await import("./runtime.ts");
const { encodeNativeMessage, NativeMessageDecoder, NativeMessageError } = await import("./native-message.ts");
const { InstallReason } = await import("./installed.ts");
const { NATIVE_HOST_REGISTRY_KEY } = await import("./native-host.ts");
const { MemoryEnd } = await import("#src/state/transports/memory.js");

const ECHO_HOST = "echo-host.exe";
// A native messaging host: echoes each message with the origin it was given
// (its first argument), and exits on "quit".
const ECHO_HOST_SOURCE = `
const HEADER_BYTES = 4;
let pending = Buffer.alloc(0);
process.stdin.on("data", chunk => {
  pending = Buffer.concat([pending, chunk]);
  while (pending.length >= HEADER_BYTES) {
    const length = pending.readUInt32LE(0);
    if (pending.length < HEADER_BYTES + length) {
      return;
    }
    const message = JSON.parse(pending.subarray(HEADER_BYTES, HEADER_BYTES + length).toString("utf8"));
    pending = pending.subarray(HEADER_BYTES + length);
    if (message === "quit") {
      process.exit(0);
    }
    const body = Buffer.from(JSON.stringify({ echo: message, origin: process.argv[1] }), "utf8");
    const header = Buffer.alloc(HEADER_BYTES);
    header.writeUInt32LE(body.length);
    process.stdout.write(Buffer.concat([header, body]));
  }
});
`;
const IDENTITY = {
  packageInfo: () => null,
  packageJson: () => ({
    file: path.join("C:", "app", "package.json"),
    text: JSON.stringify({
      name: "demo-app",
      version: "1.2.3",
      description: "A demo"
    })
  })
};

function runtimeOf(options: ConstructorParameters<typeof Runtime>[0] = {}) {
  return new Runtime({
    ...IDENTITY,
    suspendSource: null,
    ...options
  });
}

function linked() {
  const [left, right] = MemoryEnd.pair();
  const first = runtimeOf();
  const second = runtimeOf();
  first.addLink(left);
  second.addLink(right);
  return {
    first,
    second
  };
}

test("the manifest, id and URLs come from package.json", () => {
  const runtime = runtimeOf();
  assert.equal(runtime.id, "demo-app");
  assert.deepEqual(runtime.getManifest(), {
    manifest_version: 3,
    name: "demo-app",
    version: "1.2.3",
    description: "A demo"
  });
  assert.equal(runtime.getURL("/pages/a.html"), `file:///C:/app/pages/a.html`);
  assert.deepEqual(runtime.getPlatformInfo().os, "win");
});

test("a package identity wins, and its URLs are ms-appx", () => {
  const runtime = runtimeOf({
    packageInfo: () => ({
      name: "Demo",
      fullName: "Demo_1.0.0.0_x64__abc",
      familyName: "Demo_abc",
      publisher: "CN=x",
      version: "1.0.0.0",
      installedPath: "C:\\Program Files\\WindowsApps\\Demo",
      isDevelopmentMode: false,
      isFromStore: true
    })
  });
  assert.equal(runtime.id, "Demo_abc");
  assert.equal(runtime.getManifest().version, "1.0.0.0");
  assert.equal(runtime.getURL("img/a.png"), "ms-appx:///img/a.png");
});

test("sendMessage reaches the other context's listener and returns its answer", async () => {
  const { first, second } = linked();
  second.onMessage.addListener((message, sender, sendResponse) => {
    assert.equal(sender.id, "demo-app");
    sendResponse({ echo: message });
  });
  assert.deepEqual(await first.sendMessage({ hello: "world" }), {
    echo: {
      hello: "world"
    }
  });
});

test("a listener may answer with a promise, or later by returning true", async () => {
  const { first, second } = linked();
  second.onMessage.addListener(async message => {
    await Promise.resolve();
    return `promised ${String(message)}`;
  });
  assert.equal(await first.sendMessage("a"), "promised a");

  const { first: other, second: another } = linked();
  another.onMessage.addListener((_message, _sender, sendResponse) => {
    setTimeout(() => sendResponse("later"), 5);
    return true;
  });
  assert.equal(await other.sendMessage("b"), "later");
});

test("listeners that do not answer resolve undefined; no listener rejects", async () => {
  const { first, second } = linked();
  await assert.rejects(first.sendMessage("x"), /Receiving end does not exist/u);
  second.onMessage.addListener(() => {});
  assert.equal(await first.sendMessage("x"), undefined);
});

test("a failing listener rejects the sender", async () => {
  const { first, second } = linked();
  second.onMessage.addListener(async () => {
    throw new Error("nope");
  });
  await assert.rejects(first.sendMessage("x"), /nope/u);
});

test("a runtime with no link rejects sendMessage and a port disconnects with an error", async () => {
  const runtime = runtimeOf();
  await assert.rejects(runtime.sendMessage("x"), /Receiving end does not exist/u);
  const port = runtime.connect({ name: "p" });
  const ended = await new Promise<Error | undefined>(resolve => {
    port.onDisconnect.addListener(() => resolve(port.error));
  });
  assert.match(ended?.message ?? "", /Receiving end does not exist/u);
  assert.throws(() => port.postMessage(1), /disconnected port/u);
});

test("a port carries messages both ways and disconnect reaches the other end", async () => {
  const { first, second } = linked();
  const accepted = Promise.withResolvers<Port>();
  const heard = Promise.withResolvers<unknown>();
  second.onConnect.addListener(remote => {
    remote.onMessage.addListener(message => {
      heard.resolve(message);
      remote.postMessage("pong");
    });
    accepted.resolve(remote);
  });
  const port = first.connect({ name: "chat" });
  port.postMessage({ n: 1 });

  const remote = await accepted.promise;
  assert.equal(remote.name, "chat");
  assert.equal(remote.sender?.id, "demo-app");
  const replied = Promise.withResolvers<unknown>();
  port.onMessage.addListener(message => replied.resolve(message));
  port.postMessage({ n: 2 });
  assert.deepEqual(await heard.promise, { n: 1 });
  assert.equal(await replied.promise, "pong");

  const closed = Promise.withResolvers<void>();
  remote.onDisconnect.addListener(() => closed.resolve());
  port.disconnect();
  await closed.promise;
  assert.throws(() => remote.postMessage(1), /disconnected port/u);
});

test("closing the link ends its ports", async () => {
  const [left, right] = MemoryEnd.pair();
  const first = runtimeOf();
  const second = runtimeOf();
  first.addLink(left);
  second.addLink(right);
  const accepted = Promise.withResolvers<Port>();
  second.onConnect.addListener(port => accepted.resolve(port));
  const port = first.connect();
  const ended = Promise.withResolvers<void>();
  port.onDisconnect.addListener(() => ended.resolve());
  await accepted.promise;
  right.close();
  await ended.promise;
});

test("onInstalled fires for a first run and an update, not for the same version", async () => {
  let stored: string | undefined;
  const versionStore = {
    read: async () => stored,
    async write(version: string) {
      stored = version;
    }
  };
  const runtime = runtimeOf({ versionStore });
  const seen: unknown[] = [];
  runtime.onInstalled.addListener(details => seen.push(details));
  await runtime.detectInstalled();
  await runtime.detectInstalled();
  stored = "1.0.0";
  await runtime.detectInstalled();
  assert.deepEqual(seen, [
    { reason: InstallReason.install },
    {
      reason: InstallReason.update,
      previousVersion: "1.0.0"
    }
  ]);
});

function noop() {}

test("onSuspend fires from the suspend source; reload relaunches", () => {
  let suspend = noop;
  let isStopped = false;
  let relaunched = 0;
  const runtime = runtimeOf({
    suspendSource(listener) {
      suspend = listener;
      return () => {
        isStopped = true;
      };
    },
    relaunchApp() {
      relaunched += 1;
    }
  });
  let fired = 0;
  runtime.onSuspend.addListener(() => {
    fired += 1;
  });
  suspend();
  runtime.reload();
  runtime.dispose();
  assert.deepEqual([fired, relaunched, isStopped], [1, 1, true]);
});

test("onStartup is the one the activation module fires", async () => {
  const { onStartup } = await import("#src/app/schedule/events.js");
  assert.equal(runtimeOf().onStartup, onStartup);
});

test("the native message codec frames, splits and limits", () => {
  const decoder = new NativeMessageDecoder({ maxBytes: 32 });
  const bytes = Buffer.concat([encodeNativeMessage({ a: 1 }), encodeNativeMessage("two")]);
  assert.deepEqual(decoder.push(bytes.subarray(0, 3)), []);
  assert.deepEqual(decoder.push(bytes.subarray(3, 9)), []);
  assert.deepEqual(decoder.push(bytes.subarray(9)), [{ a: 1 }, "two"]);
  assert.throws(() => decoder.push(encodeNativeMessage("x".repeat(64))), NativeMessageError);
  assert.throws(() => new NativeMessageDecoder().push(Buffer.concat([Buffer.from([3, 0, 0, 0]), Buffer.from("{{{")])), NativeMessageError);
});

async function withRegisteredHost({ run, origins }: {
  run: (runtime: InstanceType<typeof Runtime>) => Promise<void>;
  origins?: readonly string[];
}) {
  const folder = await mkdtemp(path.join(tmpdir(), "native-host-"));
  try {
    const manifest = path.join(folder, "host.json");
    await writeFile(
      manifest, JSON.stringify({
        name: "com.example.echo",
        path: "echo-host.exe",
        type: "stdio",
        ...origins === undefined ? {} : { allowed_origins: origins }
      })
    );
    const registry = {
      hasKey: () => false,
      setString() {},
      deleteTree() {},
      deleteValue() {},
      deleteKeyIfEmpty: () => false,
      readString: ({ key }: { key: string }) => key === `${NATIVE_HOST_REGISTRY_KEY}\\com.example.echo` ? manifest : undefined
    };
    const runtime = runtimeOf({
      registry,
      spawnHost() {
        throw new Error("replaced below");
      }
    });
    await run(runtime);
  } finally {
    await rm(folder, {
      recursive: true,
      force: true
    });
  }
}

function echoRuntime() {
  return runtimeOf({
    async resolveHost(name) {
      assert.equal(name, "com.example.echo");
      return ECHO_HOST;
    },
    spawnHost: ({ arguments: hostArguments }) => spawn(process.execPath, ["-e", ECHO_HOST_SOURCE, ...hostArguments], { stdio: ["pipe", "pipe", "ignore"] })
  });
}

test("sendNativeMessage gets the host's reply, and the host is given the app's origin", async () => {
  const runtime = echoRuntime();
  const reply = await runtime.sendNativeMessage({
    application: "com.example.echo",
    message: {
      text: "hi"
    }
  });
  assert.deepEqual(reply, {
    echo: {
      text: "hi"
    },
    origin: "winui-svelte://demo-app/"
  });
});

test("connectNative is a port: several messages, then the host exits", async () => {
  const runtime = echoRuntime();
  const port = runtime.connectNative("com.example.echo");
  const replies: unknown[] = [];
  const ended = Promise.withResolvers<void>();
  port.onMessage.addListener(message => replies.push(message));
  port.onDisconnect.addListener(() => ended.resolve());
  port.postMessage({ n: 1 });
  port.postMessage({ n: 2 });
  port.postMessage("quit");
  await ended.promise;
  assert.deepEqual(replies, [
    {
      echo: {
        n: 1
      },
      origin: "winui-svelte://demo-app/"
    },
    {
      echo: {
        n: 2
      },
      origin: "winui-svelte://demo-app/"
    }
  ]);
});

test("a host that is not registered rejects with a clear error", async () => {
  const runtime = runtimeOf({
    registry: {
      hasKey: () => false,
      setString() {},
      deleteTree() {},
      deleteValue() {},
      deleteKeyIfEmpty: () => false,
      readString: () => undefined
    }
  });
  await assert.rejects(
    runtime.sendNativeMessage({
      application: "com.example.missing",
      message: 1
    }),
    /host not found/u
  );
  await assert.rejects(
    runtime.sendNativeMessage({
      application: "Bad Name",
      message: 1
    }),
    /not a valid native messaging host name/u
  );
});

test("a registered host is found through the registry and manifest, and its origins are checked", async () => {
  await withRegisteredHost({
    async run(runtime) {
      const port = runtime.connectNative("com.example.echo");
      // The fake spawn throws; resolution has passed when it is reached
      const ended = await new Promise<Error | undefined>(resolve => {
        port.onDisconnect.addListener(() => resolve(port.error));
      });
      assert.equal(ended?.message, "replaced below");
    }
  });
  await withRegisteredHost({
    origins: ["winui-svelte://other/"],
    async run(runtime) {
      await assert.rejects(
        runtime.sendNativeMessage({
          application: "com.example.echo",
          message: 1
        }),
        /forbidden/u
      );
    }
  });
});
